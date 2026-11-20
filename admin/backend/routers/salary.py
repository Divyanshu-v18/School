"""Salary & payroll API.

It works the same way as the Fees module:

    Fees                      Salary
    ----------------------    ------------------------------------------
    Fee Head                  Salary Type       /salary/types
    Fee Structure             Salary Structure  /salary/structure
    Payment Records           Payment Records   /salary/payment-records, /salary/payroll
    Students                  Staff             /salary/staff

Salary types are earnings (Basic Pay, HRA, ...) or deductions (PF, TDS, ...). Every staff
member is given an amount per type in the structure. Each month the school records a payment;
the payslip (earnings and deductions) is frozen at that moment, so changing someone's salary
later never rewrites what was actually paid.

Staff = Teachers + Non-Teaching staff + bus drivers. Each person has a staff_key:
    teacher_<id>   a row of teacher_details (teaching OR non-teaching, see classify_section)
    driver_<id>    a row of transport_drivers
    anything else  a custom entry of the legacy ``salary_custom_staff`` setting

Run Database/salary_v3_tables.sql once before using this module.
"""

import json
import logging
from collections import defaultdict
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from typing import Optional

import mysql.connector
from fastapi import APIRouter, HTTPException, Query, Request

from database import db_cursor
from models.salary import (
    SalaryBankIn,
    SalaryDisburseIn,
    SalaryPaymentIn,
    SalaryStructureBulk,
    SalaryTypeIn,
)
from routers.non_teaching_staff import get_department_for_post, is_non_teaching_post
from services.salary_calc import (
    BASIC_CODE,
    SECTIONS,
    academic_year_periods,
    breakdown_from_json,
    breakdown_to_json,
    classify_section,
    compute_breakdown,
    default_academic_year,
    india_today,
    is_future_period,
    mask_account,
    money,
    parse_academic_year,
    parse_period,
    period_key,
    period_label,
    slugify_code,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Salary"])

_REQUIRED_TABLES = (
    "salary_heads",
    "salary_staff_components",
    "salary_staff_payment_profiles",
    "salary_payments",
    "salary_audit_logs",
)
_TABLES_READY = False
_HISTORY_LIMIT = 24


# --------------------------------------------------------------------------- plumbing
@contextmanager
def _guard(message: str, duplicate: Optional[str] = None):
    """Turn unexpected errors into one clean 500 (details go to the log, not the browser)."""
    try:
        yield
    except HTTPException:
        raise
    except mysql.connector.IntegrityError as exc:
        if exc.errno == 1062 and duplicate:  # duplicate entry
            raise HTTPException(status_code=400, detail=duplicate) from exc
        logger.exception(message)
        raise HTTPException(status_code=500, detail=message) from exc
    except Exception as exc:
        logger.exception(message)
        raise HTTPException(status_code=500, detail=message) from exc


def _ensure_ready(cursor) -> None:
    """Fail with a clear 503 (instead of a vague 500) when the salary tables are not set up."""
    global _TABLES_READY
    if _TABLES_READY:
        return
    cursor.execute(
        """SELECT TABLE_NAME AS name FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (%s)""" % ",".join(["%s"] * len(_REQUIRED_TABLES)),
        _REQUIRED_TABLES,
    )
    found = {row["name"] for row in cursor.fetchall()}
    cursor.execute(
        """SELECT COUNT(*) AS n FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND (
               (TABLE_NAME = 'salary_payments' AND COLUMN_NAME = 'breakdown') OR
               (TABLE_NAME = 'salary_staff_payment_profiles' AND COLUMN_NAME = 'upi_id'))"""
    )
    has_columns = int((cursor.fetchone() or {}).get("n") or 0) == 2
    if found != set(_REQUIRED_TABLES) or not has_columns:
        raise HTTPException(
            status_code=503,
            detail="Salary tables are not set up yet. Run Database/salary_v3_tables.sql on the school_management database.",
        )
    _TABLES_READY = True


def _audit(cursor, request: Request, action: str, entity_type: str, entity_key=None, details=None) -> None:
    user = getattr(request.state, "user", None) or {}
    cursor.execute(
        """INSERT INTO salary_audit_logs (actor, action, entity_type, entity_key, details)
           VALUES (%s, %s, %s, %s, %s)""",
        (
            user.get("username"),
            action,
            entity_type,
            None if entity_key is None else str(entity_key),
            None if details is None else json.dumps(details, default=str),
        ),
    )


def _actor_role(request: Request) -> str:
    return (getattr(request.state, "user", None) or {}).get("role", "")


def _f(value) -> float:
    """Decimal -> float for JSON. Amounts are always computed as Decimal first."""
    return float(money(value))


def _valid_year(value: str) -> int:
    try:
        return parse_academic_year(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid academic year.")


def _valid_period(value: str) -> tuple[int, int]:
    try:
        return parse_period(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payroll month.")


def _valid_date(value: Optional[str], label: str) -> date:
    try:
        return date.fromisoformat(value or "")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} is not a valid date.")


def _valid_section(value: Optional[str]) -> Optional[str]:
    if value in (None, ""):
        return None
    if value not in SECTIONS:
        raise HTTPException(status_code=400, detail="Invalid staff section.")
    return value


def _json_value(raw):
    """MySQL drivers return JSON columns as text (or bytes)."""
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", "replace")
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except ValueError:
            return None
    return raw


# --------------------------------------------------------------------------- data loading
def _setting(cursor, key: str, default):
    cursor.execute("SELECT setting_value FROM school_settings WHERE setting_key = %s", (key,))
    row = cursor.fetchone()
    value = _json_value(row.get("setting_value")) if row else None
    return value if isinstance(value, type(default)) else default


def _load_heads(cursor) -> list[dict]:
    """Active salary types: Basic Pay first, then earnings, then deductions."""
    cursor.execute(
        """SELECT head_id, code, name, component_type, description FROM salary_heads
           WHERE is_active = 1 ORDER BY (code = %s) DESC, component_type, head_id""",
        (BASIC_CODE,),
    )
    return list(cursor.fetchall())


def _load_components(cursor) -> dict:
    """{staff_key: {head_id: Decimal amount}}"""
    cursor.execute("SELECT staff_key, head_id, amount FROM salary_staff_components")
    result: dict = defaultdict(dict)
    for row in cursor.fetchall():
        result[row["staff_key"]][row["head_id"]] = money(row["amount"])
    return result


def _load_staff(cursor) -> list[dict]:
    """Everyone who can be paid, each in exactly one section."""
    directory_types = _setting(cursor, "staff_directory_types", {})
    staff, seen = [], set()

    cursor.execute(
        """SELECT td.teacher_id, td.full_name, tpd.post
           FROM teacher_details td
           LEFT JOIN teacher_personal_details tpd ON tpd.teacher_id = td.teacher_id"""
    )
    for row in cursor.fetchall():
        teacher_id = row["teacher_id"]
        post = row.get("post") or ""
        section = classify_section(directory_types.get(str(teacher_id)), post, is_non_teaching_post)
        teaching = section == "teaching"
        staff.append({
            "staff_key": f"teacher_{teacher_id}",
            "staff_id": str(teacher_id) if teaching else f"EMP-{1000 + teacher_id}",
            "full_name": row["full_name"],
            "post": post or ("Faculty" if teaching else "Employee"),
            "section": section,
            "department": "Teaching" if teaching else get_department_for_post(post),
        })

    try:
        cursor.execute("SELECT driver_id, full_name FROM transport_drivers")
        for row in cursor.fetchall():
            staff.append({
                "staff_key": f"driver_{row['driver_id']}",
                "staff_id": f"DRV-{100 + row['driver_id']}",
                "full_name": row["full_name"],
                "post": "School Bus Driver",
                "section": "non_teaching",
                "department": "Transport",
            })
    except mysql.connector.Error:
        logger.warning("transport_drivers could not be read; drivers are left out of payroll.", exc_info=True)

    for custom in _setting(cursor, "salary_custom_staff", []):
        if not isinstance(custom, dict) or not custom.get("staff_key") or not custom.get("full_name"):
            continue
        teaching = bool(custom.get("is_teaching", False))
        staff.append({
            "staff_key": str(custom["staff_key"]),
            "staff_id": str(custom.get("staff_id") or custom["staff_key"]),
            "full_name": str(custom["full_name"]),
            "post": str(custom.get("post") or ("Faculty" if teaching else "Employee")),
            "section": "teaching" if teaching else "non_teaching",
            "department": str(custom.get("department") or ("Teaching" if teaching else "Support Staff")),
        })

    unique = []
    for person in staff:
        if person["staff_key"] in seen:
            continue
        seen.add(person["staff_key"])
        unique.append(person)
    unique.sort(key=lambda p: (p["section"] != "teaching", p["full_name"].lower(), p["staff_key"]))
    return unique


def _staff_with_pay(staff: list[dict], heads: list[dict], components: dict) -> list[dict]:
    """Each person plus the numbers worked out from the current structure."""
    result = []
    for person in staff:
        amounts = components.get(person["staff_key"], {})
        b = compute_breakdown(heads, amounts)
        result.append({
            **person,
            "amounts": {str(head_id): _f(amount) for head_id, amount in amounts.items()},
            "gross": _f(b["gross"]),
            "deductions": _f(b["total_deductions"]),
            "net": _f(b["net"]),
        })
    return result


# --------------------------------------------------------------------------- Salary Types
@router.get("/salary/types")
def list_salary_types():
    with _guard("Unable to load salary types."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            return _load_heads(cursor)


@router.post("/salary/types")
def create_salary_type(data: SalaryTypeIn, request: Request):
    with _guard("Unable to create the salary type.", duplicate="A salary type with this name already exists."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            cursor.execute("SELECT 1 AS n FROM salary_heads WHERE LOWER(name) = LOWER(%s) AND is_active = 1", (data.name,))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="A salary type with this name already exists.")
            cursor.execute("SELECT code FROM salary_heads")
            code = slugify_code(data.name, {row["code"] for row in cursor.fetchall()})
            cursor.execute(
                "INSERT INTO salary_heads (code, name, component_type, description) VALUES (%s, %s, %s, %s)",
                (code, data.name, data.component_type, data.description),
            )
            head_id = cursor.lastrowid
            _audit(cursor, request, "type_created", "salary_type", head_id,
                   {"name": data.name, "component_type": data.component_type})
            return {"head_id": head_id, "message": "Salary type created."}


@router.put("/salary/types/{head_id}")
def update_salary_type(head_id: int, data: SalaryTypeIn, request: Request):
    with _guard("Unable to update the salary type.", duplicate="A salary type with this name already exists."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            cursor.execute(
                "SELECT code, name, component_type FROM salary_heads WHERE head_id = %s AND is_active = 1 FOR UPDATE",
                (head_id,),
            )
            current = cursor.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Salary type not found.")
            if current["code"] == BASIC_CODE and data.component_type != "earning":
                raise HTTPException(status_code=400, detail="Basic Pay must stay an earning.")
            cursor.execute(
                "SELECT 1 AS n FROM salary_heads WHERE LOWER(name) = LOWER(%s) AND is_active = 1 AND head_id <> %s",
                (data.name, head_id),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="A salary type with this name already exists.")
            cursor.execute(
                "UPDATE salary_heads SET name = %s, component_type = %s, description = %s WHERE head_id = %s",
                (data.name, data.component_type, data.description, head_id),
            )
            _audit(cursor, request, "type_updated", "salary_type", head_id,
                   {"from": {"name": current["name"], "component_type": current["component_type"]},
                    "to": {"name": data.name, "component_type": data.component_type}})
            return {"message": "Salary type updated."}


@router.delete("/salary/types/{head_id}")
def delete_salary_type(head_id: int, request: Request):
    """Retire a type. Past payslips keep their own copy of it, so history is not affected."""
    with _guard("Unable to delete the salary type."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            cursor.execute(
                "SELECT code, name FROM salary_heads WHERE head_id = %s AND is_active = 1 FOR UPDATE", (head_id,)
            )
            current = cursor.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Salary type not found.")
            if current["code"] == BASIC_CODE:
                raise HTTPException(status_code=400, detail="Basic Pay is required and cannot be deleted.")
            cursor.execute("DELETE FROM salary_staff_components WHERE head_id = %s", (head_id,))
            # Rename the retired row so its name and code can be used again for a new type.
            cursor.execute(
                """UPDATE salary_heads
                   SET is_active = 0,
                       name = CONCAT(LEFT(name, 50), ' [deleted ', head_id, ']'),
                       code = CONCAT(LEFT(code, 24), '_del_', head_id)
                   WHERE head_id = %s""",
                (head_id,),
            )
            _audit(cursor, request, "type_deleted", "salary_type", head_id, {"name": current["name"]})
            return {"message": "Salary type deleted."}


# --------------------------------------------------------------------------- Staff
@router.get("/salary/staff")
def list_salary_staff(section: Optional[str] = Query(default=None)):
    section = _valid_section(section)
    with _guard("Unable to load staff."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            heads, components = _load_heads(cursor), _load_components(cursor)
            people = _staff_with_pay(_load_staff(cursor), heads, components)
            for person in people:
                person.pop("amounts")  # the list view only needs the totals
            return [p for p in people if section is None or p["section"] == section]


def _history_row(row: dict) -> dict:
    b = breakdown_from_json(_json_value(row.get("breakdown")))
    basic = next((item["amount"] for item in b["earnings"] if item.get("code") == BASIC_CODE), Decimal("0"))
    return {
        "payment_id": row["payment_id"],
        "period": period_key(row["payroll_year"], row["payroll_month"]),
        "month": period_label(row["payroll_year"], row["payroll_month"]),
        "status": row["status"],
        "payment_date": row["payment_date"].isoformat() if row.get("payment_date") else None,
        "payment_mode": row.get("payment_mode"),
        "reference_no": row.get("reference_no"),
        "remarks": row.get("remarks"),
        "basic_pay": _f(basic),
        "gross_salary": _f(row["gross_salary"]),
        "deductions": _f(row["total_deductions"]),
        "net_pay": _f(row["net_salary"]),
    }


def _staff_profile(cursor, staff_key: str, reveal_account: bool) -> dict:
    person = next((p for p in _load_staff(cursor) if p["staff_key"] == staff_key), None)
    if not person:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    heads, components = _load_heads(cursor), _load_components(cursor)
    b = compute_breakdown(heads, components.get(staff_key, {}))

    cursor.execute(
        """SELECT bank_name, account_number, ifsc_code, pan_number, upi_id, payment_mode
           FROM salary_staff_payment_profiles WHERE staff_key = %s""",
        (staff_key,),
    )
    bank = cursor.fetchone() or {}
    cursor.execute(
        """SELECT payment_id, payroll_month, payroll_year, gross_salary, total_deductions, net_salary,
                  payment_date, payment_mode, reference_no, remarks, status, breakdown
           FROM salary_payments WHERE staff_key = %s
           ORDER BY payroll_year DESC, payroll_month DESC LIMIT %s""",
        (staff_key, _HISTORY_LIMIT),
    )
    history = [_history_row(row) for row in cursor.fetchall()]

    def items(entries):
        return [{"head_id": e["head_id"], "code": e["code"], "name": e["name"], "amount": _f(e["amount"])} for e in entries]

    account = bank.get("account_number")
    return {
        **person,
        "earnings": items(b["earnings"]),
        "deductions": items(b["deductions"]),
        "gross": _f(b["gross"]),
        "total_deductions": _f(b["total_deductions"]),
        "net": _f(b["net"]),
        "bank": {
            "bank_name": bank.get("bank_name"),
            "account_number": account if reveal_account else mask_account(account),
            "ifsc_code": bank.get("ifsc_code"),
            "pan_number": bank.get("pan_number"),
            "upi_id": bank.get("upi_id"),
            "payment_mode": bank.get("payment_mode"),
        },
        "history": history,
    }


@router.get("/salary/staff/{staff_key}")
def get_salary_staff(staff_key: str, request: Request):
    with _guard("Unable to load the staff salary details."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            # Only an administrator may see a full account number (to correct it).
            return _staff_profile(cursor, staff_key, reveal_account=_actor_role(request) == "admin")


@router.put("/salary/staff/{staff_key}/bank")
def update_salary_bank(staff_key: str, data: SalaryBankIn, request: Request):
    with _guard("Unable to save the bank details."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            if not any(p["staff_key"] == staff_key for p in _load_staff(cursor)):
                raise HTTPException(status_code=404, detail="Staff member not found.")
            cursor.execute(
                """INSERT INTO salary_staff_payment_profiles
                       (staff_key, bank_name, account_number, ifsc_code, pan_number, upi_id, payment_mode)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE bank_name = VALUES(bank_name), account_number = VALUES(account_number),
                       ifsc_code = VALUES(ifsc_code), pan_number = VALUES(pan_number), upi_id = VALUES(upi_id),
                       payment_mode = VALUES(payment_mode)""",
                (staff_key, data.bank_name, data.account_number,
                 data.ifsc_code.upper() if data.ifsc_code else None,
                 data.pan_number.upper() if data.pan_number else None, data.upi_id, data.payment_mode),
            )
            _audit(cursor, request, "bank_updated", "staff", staff_key)  # numbers are never written to the log
            return {"message": "Bank details saved."}


# --------------------------------------------------------------------------- Salary Structure
@router.get("/salary/structure")
def get_salary_structure(section: Optional[str] = Query(default=None)):
    section = _valid_section(section)
    with _guard("Unable to load the salary structure."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            heads, components = _load_heads(cursor), _load_components(cursor)
            people = _staff_with_pay(_load_staff(cursor), heads, components)
            return {"types": heads, "staff": [p for p in people if section is None or p["section"] == section]}


@router.put("/salary/structure/bulk")
def save_salary_structure(data: SalaryStructureBulk, request: Request):
    """Save changed cells of the Staff x Type grid. A blank amount (null) removes the entry."""
    with _guard("Unable to save the salary structure."):
        with db_cursor(dictionary=True, autocommit=False) as (cursor, connection):
            _ensure_ready(cursor)
            heads = {head["head_id"]: head for head in _load_heads(cursor)}
            staff_keys = {person["staff_key"] for person in _load_staff(cursor)}
            current = _load_components(cursor)
            changes = []
            for item in data.items:
                if item.head_id not in heads:
                    raise HTTPException(status_code=404, detail=f"Salary type {item.head_id} not found.")
                if item.staff_key not in staff_keys:
                    raise HTTPException(status_code=404, detail=f"Staff member {item.staff_key} not found.")
                old = current.get(item.staff_key, {}).get(item.head_id)
                new = None if item.amount is None else money(item.amount)
                if new is None:
                    if old is None:
                        continue
                    cursor.execute("DELETE FROM salary_staff_components WHERE staff_key = %s AND head_id = %s",
                                   (item.staff_key, item.head_id))
                else:
                    if old is not None and money(old) == new:
                        continue
                    cursor.execute(
                        """INSERT INTO salary_staff_components (staff_key, head_id, amount) VALUES (%s, %s, %s)
                           ON DUPLICATE KEY UPDATE amount = VALUES(amount)""",
                        (item.staff_key, item.head_id, new),
                    )
                current.setdefault(item.staff_key, {})
                if new is None:
                    current[item.staff_key].pop(item.head_id, None)
                else:
                    current[item.staff_key][item.head_id] = new
                changes.append({"staff": item.staff_key, "type": heads[item.head_id]["name"],
                                "old": None if old is None else str(old), "new": None if new is None else str(new)})
            if changes:
                _audit(cursor, request, "structure_saved", "salary_structure", None,
                       {"changed": len(changes), "changes": changes[:200]})
            connection.commit()
            return {"message": "Salary structure saved.", "updated": len(changes)}


# --------------------------------------------------------------------------- Payroll positions
def _paid_by_period(cursor, start_year: int) -> dict:
    """{(year, month): {staff_key: net paid}} for every Paid row of the academic year."""
    cursor.execute(
        """SELECT staff_key, payroll_month, payroll_year, net_salary FROM salary_payments
           WHERE status = 'Paid' AND payroll_year * 100 + payroll_month BETWEEN %s AND %s""",
        (start_year * 100 + 4, (start_year + 1) * 100 + 3),
    )
    paid: dict = defaultdict(dict)
    for row in cursor.fetchall():
        paid[(row["payroll_year"], row["payroll_month"])][row["staff_key"]] = money(row["net_salary"])
    return paid


def _year_position(cursor, academic_year: str) -> dict:
    """Month-by-month payroll position of one academic year (shared by Overview and Payment Records)."""
    start_year = _valid_year(academic_year)
    today = india_today()
    heads, components = _load_heads(cursor), _load_components(cursor)
    staff = _load_staff(cursor)
    pay = {p["staff_key"]: compute_breakdown(heads, components.get(p["staff_key"], {})) for p in staff}
    net_now = {key: b["net"] for key, b in pay.items()}
    paid = _paid_by_period(cursor, start_year)

    months = []
    for year, month in academic_year_periods(start_year):
        paid_map = paid.get((year, month), {})
        pending = [key for key, net in net_now.items() if key not in paid_map and net > 0]
        paid_amount = sum(paid_map.values(), Decimal("0.00"))
        pending_amount = sum((net_now[key] for key in pending), Decimal("0.00"))
        future = is_future_period(year, month, today)
        if future:
            status = "Upcoming"
        elif paid_map and not pending:
            status = "Completed"
        elif paid_map:
            status = "Partial"
        elif not pending:
            status = "No salary set"
        else:
            status = "Pending"
        months.append({
            "period": period_key(year, month), "label": period_label(year, month), "future": future,
            "status": status, "paid_count": len(paid_map), "pending_count": len(pending),
            "paid_amount": paid_amount, "pending_amount": pending_amount,
        })
    return {"start_year": start_year, "months": months, "staff": staff, "pay": pay}


@router.get("/salary/overview")
def get_salary_overview(academic_year: str = Query(default_factory=lambda: default_academic_year(india_today()))):
    with _guard("Unable to load the salary overview."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            position = _year_position(cursor, academic_year)
            months, staff, pay = position["months"], position["staff"], position["pay"]
            due = [m for m in months if not m["future"]]
            return {
                "academic_year": academic_year,
                "summary": {
                    "paid": _f(sum((m["paid_amount"] for m in months), Decimal("0"))),
                    "pending": _f(sum((m["pending_amount"] for m in due), Decimal("0"))),
                    "monthly_payroll": _f(sum((b["net"] for b in pay.values()), Decimal("0"))),
                    "staff_count": len(staff),
                    "teaching_count": sum(1 for p in staff if p["section"] == "teaching"),
                    "non_teaching_count": sum(1 for p in staff if p["section"] == "non_teaching"),
                    "unconfigured_count": sum(1 for b in pay.values() if b["net"] <= 0),
                },
                "monthly_paid": [{"label": m["label"].split()[0][:3], "amount": _f(m["paid_amount"])} for m in months],
                "payment_statuses": {
                    "Paid": sum(m["paid_count"] for m in months),
                    "Pending": sum(m["pending_count"] for m in due),
                },
            }


@router.get("/salary/payment-records")
def get_salary_payment_records(academic_year: str = Query(default_factory=lambda: default_academic_year(india_today()))):
    """One row per payroll month: how much is payable, paid and still pending."""
    with _guard("Unable to load salary payment records."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            months = _year_position(cursor, academic_year)["months"]
            rows = [{
                "period": m["period"], "label": m["label"], "future": m["future"], "status": m["status"],
                "paid_count": m["paid_count"], "pending_count": m["pending_count"],
                "paid_amount": _f(m["paid_amount"]), "pending_amount": _f(m["pending_amount"]),
                "total_payable": _f(m["paid_amount"] + m["pending_amount"]),
            } for m in months]
            return {
                "academic_year": academic_year,
                "summary": {
                    "payable": _f(sum((m["paid_amount"] + m["pending_amount"] for m in months), Decimal("0"))),
                    "paid": _f(sum((m["paid_amount"] for m in months), Decimal("0"))),
                    "pending": _f(sum((m["pending_amount"] for m in months if not m["future"]), Decimal("0"))),
                },
                "months": rows,
            }


@router.get("/salary/payroll")
def get_salary_payroll(period: str = Query(...), section: Optional[str] = Query(default=None)):
    """Every staff member's salary for one month (the screen behind 'View Staff')."""
    year, month = _valid_period(period)
    section = _valid_section(section)
    with _guard("Unable to load the monthly payroll."):
        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_ready(cursor)
            heads, components = _load_heads(cursor), _load_components(cursor)
            cursor.execute(
                """SELECT payment_id, staff_key, gross_salary, total_deductions, net_salary, payment_date,
                          payment_mode, reference_no, remarks FROM salary_payments
                   WHERE status = 'Paid' AND payroll_year = %s AND payroll_month = %s""",
                (year, month),
            )
            paid = {row["staff_key"]: row for row in cursor.fetchall()}
            rows = []
            for person in _load_staff(cursor):
                if section and person["section"] != section:
                    continue
                b = compute_breakdown(heads, components.get(person["staff_key"], {}))
                record = paid.get(person["staff_key"])
                row = {**person, "status": "Pending", "payment_id": None, "payment_date": None, "payment_mode": None,
                       "reference_no": None, "remarks": None,
                       "gross": _f(b["gross"]), "deductions": _f(b["total_deductions"]), "net": _f(b["net"]),
                       "has_salary": b["net"] > 0}
                if record:  # a paid month shows what was really paid, not today's structure
                    row.update({
                        "status": "Paid", "payment_id": record["payment_id"],
                        "payment_date": record["payment_date"].isoformat() if record["payment_date"] else None,
                        "payment_mode": record["payment_mode"], "reference_no": record["reference_no"],
                        "remarks": record["remarks"], "gross": _f(record["gross_salary"]),
                        "deductions": _f(record["total_deductions"]), "net": _f(record["net_salary"]),
                        "has_salary": True,
                    })
                rows.append(row)
            paid_total = sum((Decimal(str(r["net"])) for r in rows if r["status"] == "Paid"), Decimal("0"))
            pending_total = sum((Decimal(str(r["net"])) for r in rows if r["status"] == "Pending"), Decimal("0"))
            return {
                "period": period_key(year, month), "label": period_label(year, month),
                "future": is_future_period(year, month, india_today()),
                "summary": {
                    "paid": _f(paid_total), "pending": _f(pending_total),
                    "paid_count": sum(1 for r in rows if r["status"] == "Paid"),
                    "pending_count": sum(1 for r in rows if r["status"] == "Pending" and r["has_salary"]),
                    "no_salary_count": sum(1 for r in rows if not r["has_salary"]),
                },
                "rows": rows,
            }


# --------------------------------------------------------------------------- recording payments
def _check_payment_inputs(year: int, month: int, payment_date: date, today: date) -> None:
    if is_future_period(year, month, today):
        raise HTTPException(status_code=400, detail="Cannot process salary for a future payroll period.")
    if payment_date > today:
        raise HTTPException(status_code=400, detail="Payment date cannot be in the future.")


def _save_paid(cursor, staff_key, year, month, b, pay_date, mode, reference, remarks) -> str:
    """Insert or replace the Paid row for one staff member and month; returns its reference number."""
    cursor.execute(
        """INSERT INTO salary_payments
               (staff_key, payroll_month, payroll_year, gross_salary, total_deductions, net_salary,
                payment_date, payment_mode, reference_no, remarks, breakdown, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Paid')
           ON DUPLICATE KEY UPDATE gross_salary = VALUES(gross_salary), total_deductions = VALUES(total_deductions),
               net_salary = VALUES(net_salary), payment_date = VALUES(payment_date), payment_mode = VALUES(payment_mode),
               reference_no = VALUES(reference_no), remarks = VALUES(remarks), breakdown = VALUES(breakdown),
               status = 'Paid'""",
        (staff_key, month, year, b["gross"], b["total_deductions"], b["net"], pay_date, mode,
         reference or None, remarks or None, json.dumps(breakdown_to_json(b))),
    )
    cursor.execute(
        "SELECT payment_id FROM salary_payments WHERE staff_key = %s AND payroll_year = %s AND payroll_month = %s",
        (staff_key, year, month),
    )
    payment_id = cursor.fetchone()["payment_id"]
    if not reference:
        reference = f"SAL{year}{month:02d}-{payment_id:04d}"
        cursor.execute("UPDATE salary_payments SET reference_no = %s WHERE payment_id = %s", (reference, payment_id))
    return reference


@router.put("/salary/payroll")
def update_salary_payment(data: SalaryPaymentIn, request: Request):
    """Mark one staff member's month Paid (or back to Pending), or correct a payment's details."""
    year, month = _valid_period(data.period)
    with _guard("Unable to save the salary payment."):
        with db_cursor(dictionary=True, autocommit=False) as (cursor, connection):
            _ensure_ready(cursor)
            person = next((p for p in _load_staff(cursor) if p["staff_key"] == data.staff_key), None)
            if not person:
                raise HTTPException(status_code=404, detail="Staff member not found.")
            cursor.execute(
                """SELECT payment_id, status, gross_salary, total_deductions, net_salary FROM salary_payments
                   WHERE staff_key = %s AND payroll_year = %s AND payroll_month = %s FOR UPDATE""",
                (data.staff_key, year, month),
            )
            existing = cursor.fetchone()

            if data.status == "Pending":
                if existing:
                    cursor.execute("DELETE FROM salary_payments WHERE payment_id = %s", (existing["payment_id"],))
                    _audit(cursor, request, "payment_reverted", "salary_payment", data.staff_key,
                           {"period": data.period, "net": str(existing["net_salary"])})
                connection.commit()
                return {"message": "Salary marked as pending."}

            if not data.payment_mode:
                raise HTTPException(status_code=400, detail="Choose a payment mode.")
            pay_date = _valid_date(data.payment_date, "Payment date")
            _check_payment_inputs(year, month, pay_date, india_today())

            if existing and existing["status"] == "Paid":
                # Correcting details only: the amounts that were paid stay exactly as they were.
                cursor.execute(
                    """UPDATE salary_payments SET payment_date = %s, payment_mode = %s,
                           reference_no = COALESCE(%s, reference_no), remarks = %s WHERE payment_id = %s""",
                    (pay_date, data.payment_mode, data.reference_no or None, data.remarks or None, existing["payment_id"]),
                )
                _audit(cursor, request, "payment_edited", "salary_payment", data.staff_key, {"period": data.period})
                connection.commit()
                return {"message": "Payment details updated."}

            b = compute_breakdown(_load_heads(cursor), _load_components(cursor).get(data.staff_key, {}))
            if b["gross"] <= 0:
                raise HTTPException(status_code=400,
                                    detail=f"No salary is set for {person['full_name']}. Set it in Salary Structure first.")
            if b["net"] <= 0:
                raise HTTPException(status_code=400,
                                    detail=f"Deductions for {person['full_name']} are not less than the earnings. Check Salary Structure.")
            reference = _save_paid(cursor, data.staff_key, year, month, b, pay_date, data.payment_mode,
                                   data.reference_no, data.remarks)
            _audit(cursor, request, "payment_recorded", "salary_payment", data.staff_key,
                   {"period": data.period, "net": str(b["net"]), "mode": data.payment_mode, "reference": reference})
            connection.commit()
            return {"message": "Salary marked as paid.", "reference_no": reference}


@router.post("/salary/disburse")
def disburse_salary(data: SalaryDisburseIn, request: Request):
    """Pay every unpaid staff member (of one section, or all) for a month."""
    year, month = _valid_period(data.period)
    section = _valid_section(data.section)
    pay_date = _valid_date(data.payment_date, "Payment date")
    _check_payment_inputs(year, month, pay_date, india_today())
    with _guard("Unable to disburse salaries."):
        with db_cursor(dictionary=True, autocommit=False) as (cursor, connection):
            _ensure_ready(cursor)
            heads, components = _load_heads(cursor), _load_components(cursor)
            cursor.execute(
                "SELECT staff_key FROM salary_payments WHERE status = 'Paid' AND payroll_year = %s AND payroll_month = %s FOR UPDATE",
                (year, month),
            )
            already_paid = {row["staff_key"] for row in cursor.fetchall()}
            paid_count, skipped, total = 0, 0, Decimal("0.00")
            for person in _load_staff(cursor):
                if (section and person["section"] != section) or person["staff_key"] in already_paid:
                    continue
                b = compute_breakdown(heads, components.get(person["staff_key"], {}))
                if b["net"] <= 0:
                    skipped += 1  # nothing to pay: no salary set, or deductions exceed earnings
                    continue
                _save_paid(cursor, person["staff_key"], year, month, b, pay_date, data.payment_mode, None, data.remarks)
                paid_count += 1
                total += b["net"]
            _audit(cursor, request, "bulk_disbursed", "salary_payment", data.period,
                   {"paid": paid_count, "skipped": skipped, "total": str(total), "section": section,
                    "mode": data.payment_mode})
            connection.commit()
            return {"message": f"{paid_count} salaries marked as paid.", "paid": paid_count, "skipped": skipped,
                    "total": _f(total)}


# --------------------------------------------------------------------------- used by the Teacher profile page
def get_teacher_salary_view(cursor, teacher_id: int) -> dict:
    """Real salary data in the shape the Teacher > Salary tab shows (replaces the old placeholder numbers)."""
    _ensure_ready(cursor)
    profile = _staff_profile(cursor, f"teacher_{teacher_id}", reveal_account=False)  # that page only needs masked data
    cursor.execute("SELECT cl FROM teacher_personal_details WHERE teacher_id = %s", (teacher_id,))
    row = cursor.fetchone() or {}
    basic = next((e["amount"] for e in profile["earnings"] if e["code"] == BASIC_CODE), 0.0)
    return {
        "teacher_id": teacher_id,
        "full_name": profile["full_name"],
        "post": profile["post"],
        "structure": {
            "basic_pay": basic,
            "gross_salary": profile["gross"],
            "total_deductions": profile["total_deductions"],
            "net_salary": profile["net"],
            "cl_balance": row.get("cl") if row.get("cl") is not None else 12,
        },
        "earnings": profile["earnings"],
        "deductions": profile["deductions"],
        "bank_details": profile["bank"],
        "payslips": [h for h in profile["history"] if h["status"] == "Paid"],
    }
