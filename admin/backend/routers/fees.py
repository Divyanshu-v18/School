"""Read-only data API for the first Fees overview tab."""

import json
import logging
from decimal import Decimal
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from database import db_cursor
from models.fee import FeeHeadIn, FeeOverviewQuery, FeePaymentUpdate, FeeStructureBulk

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Fees"])
FREQUENCIES = {"monthly", "quarterly", "half_yearly", "yearly", "one_time"}


def _default_academic_year() -> str:
    today = date.today()
    start = today.year if today.month >= 4 else today.year - 1
    return f"{start}-{start + 1}"


def _clean_class(value: str) -> str:
    """Store numeric classes consistently while retaining named pre-primary classes."""
    return str(value).strip().removeprefix("Class ").strip()


def _valid_year(value: str) -> str:
    try:
        return FeeOverviewQuery(academic_year=value).academic_year
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid academic year.")


def _heads_key(academic_year: str) -> str:
    """Fee heads are stored separately for every academic year."""
    return f"fee_heads:{academic_year}"


def _migrate_legacy_fee_heads(cursor) -> None:
    """Fee heads used to be shared by all years. Give them to the current year, once."""
    cursor.execute("SELECT setting_value FROM school_settings WHERE setting_key = 'fee_heads'")
    legacy = cursor.fetchone()
    if not legacy:
        return
    target = _heads_key(_default_academic_year())
    cursor.execute("SELECT setting_key FROM school_settings WHERE setting_key = %s", (target,))
    if not cursor.fetchone():
        cursor.execute("INSERT INTO school_settings(setting_key, setting_value) VALUES (%s, %s)",
                       (target, legacy.get("setting_value") or "[]"))
    cursor.execute("DELETE FROM school_settings WHERE setting_key = 'fee_heads'")


def _get_fee_heads(cursor, academic_year: str) -> list[dict]:
    query = "SELECT setting_value FROM school_settings WHERE setting_key = %s"
    cursor.execute(query, (_heads_key(academic_year),))
    row = cursor.fetchone()
    if not row:
        _migrate_legacy_fee_heads(cursor)
        cursor.execute(query, (_heads_key(academic_year),))
        row = cursor.fetchone()
    if not row:
        return []  # a year with no saved heads starts blank
    try:
        heads = json.loads(row.get("setting_value") or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return heads if isinstance(heads, list) else []


def _save_fee_heads(cursor, academic_year: str, heads: list[dict]) -> None:
    cursor.execute(
        """INSERT INTO school_settings(setting_key, setting_value) VALUES (%s, %s)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)""",
        (_heads_key(academic_year), json.dumps(heads)),
    )


@router.get("/fees/heads")
def list_fee_heads(academic_year: str = Query(default_factory=_default_academic_year)):
    academic_year = _valid_year(academic_year)
    with db_cursor(dictionary=True) as (cursor, _):
        return [head for head in _get_fee_heads(cursor, academic_year) if head.get("is_active", True)]


@router.post("/fees/heads")
def create_fee_head(data: FeeHeadIn, academic_year: str = Query(default_factory=_default_academic_year)):
    academic_year = _valid_year(academic_year)
    with db_cursor(dictionary=True) as (cursor, _):
        heads = _get_fee_heads(cursor, academic_year)
        if any(head.get("is_active", True) and head.get("name", "").lower() == data.name.lower() for head in heads):
            raise HTTPException(status_code=400, detail="A fee head with this name already exists.")
        head_id = max((int(head.get("head_id", 0)) for head in heads), default=0) + 1
        heads.append({"head_id": head_id, "name": data.name, "frequency": data.frequency,
                      "due_day": data.due_day, "description": data.description, "is_active": True})
        _save_fee_heads(cursor, academic_year, heads)
        return {"head_id": head_id, "message": "Fee head created."}


@router.put("/fees/heads/{head_id}")
def update_fee_head(head_id: int, data: FeeHeadIn, academic_year: str = Query(default_factory=_default_academic_year)):
    academic_year = _valid_year(academic_year)
    with db_cursor(dictionary=True) as (cursor, _):
        heads = _get_fee_heads(cursor, academic_year)
        target = next((head for head in heads if int(head.get("head_id", 0)) == head_id and head.get("is_active", True)), None)
        if not target:
            raise HTTPException(status_code=404, detail="Fee head not found.")
        if any(int(head.get("head_id", 0)) != head_id and head.get("is_active", True) and head.get("name", "").lower() == data.name.lower() for head in heads):
            raise HTTPException(status_code=400, detail="A fee head with this name already exists.")
        old_name = target["name"]
        target.update({"name": data.name, "frequency": data.frequency, "due_day": data.due_day, "description": data.description})
        _save_fee_heads(cursor, academic_year, heads)
        if old_name != data.name:
            # Only this academic year's amounts and payments follow the rename.
            cursor.execute("UPDATE fee_structure SET fee_type = %s WHERE fee_type = %s AND academic_year = %s",
                           (data.name, old_name, academic_year))
            _ensure_fee_period_column(cursor)
            period_keys = _period_keys(int(academic_year[:4]), academic_year)
            marks = ",".join(["%s"] * len(period_keys))
            cursor.execute(f"UPDATE fee_payments SET fee_type = %s WHERE fee_type = %s AND fee_period IN ({marks})",
                           (data.name, old_name, *period_keys))
        return {"message": "Fee head updated."}


@router.delete("/fees/heads/{head_id}")
def delete_fee_head(head_id: int, academic_year: str = Query(default_factory=_default_academic_year)):
    academic_year = _valid_year(academic_year)
    with db_cursor(dictionary=True) as (cursor, _):
        heads = _get_fee_heads(cursor, academic_year)
        target = next((head for head in heads if int(head.get("head_id", 0)) == head_id and head.get("is_active", True)), None)
        if not target:
            raise HTTPException(status_code=404, detail="Fee head not found.")
        target["is_active"] = False
        _save_fee_heads(cursor, academic_year, heads)
        cursor.execute("DELETE FROM fee_structure WHERE fee_type = %s AND academic_year = %s",
                       (target["name"], academic_year))
        return {"message": "Fee head deleted."}


@router.get("/fees/structures")
def list_fee_structures(academic_year: str = Query(default_factory=_default_academic_year)):
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        with db_cursor(dictionary=True) as (cursor, _):
            heads = _get_fee_heads(cursor, academic_year)
            head_by_name = {head.get("name", "").lower(): head for head in heads if head.get("is_active", True)}
            cursor.execute(
                """SELECT fee_id, class_name, fee_type, amount FROM fee_structure
                   WHERE academic_year = %s ORDER BY fee_id DESC""",
                (academic_year,),
            )
            structures, seen = [], set()
            for row in cursor.fetchall():
                head = head_by_name.get(str(row["fee_type"] or "").lower())
                if not head:
                    continue
                structure_key = (_clean_class(row["class_name"]).upper(), int(head["head_id"]))
                if structure_key in seen:
                    continue
                seen.add(structure_key)
                structures.append({"class_name": structure_key[0], "fee_type": row["fee_type"],
                                   "head_id": head["head_id"], "amount": float(row["amount"] or 0)})
            return structures
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load fee structures")
        raise HTTPException(status_code=500, detail="Unable to load fee structure.")


@router.put("/fees/structures/bulk")
def save_fee_structures(data: FeeStructureBulk):
    FeeOverviewQuery(academic_year=data.academic_year)
    with db_cursor(dictionary=True, autocommit=False) as (cursor, connection):
        heads = {int(head.get("head_id", 0)): head for head in _get_fee_heads(cursor, data.academic_year) if head.get("is_active", True)}
        for item in data.items:
            head = heads.get(item.head_id)
            if not head:
                raise HTTPException(status_code=404, detail=f"Fee head {item.head_id} not found.")
            class_name = _clean_class(item.class_name)
            # Older rows may have been stored as "Class 1" while the grid
            # stores "1". Remove either representation before saving so a
            # class/head has exactly one current amount.
            cursor.execute(
                """DELETE FROM fee_structure
                   WHERE UPPER(TRIM(REPLACE(class_name, 'Class ', ''))) = UPPER(%s)
                     AND fee_type = %s AND academic_year = %s""",
                (class_name, head["name"], data.academic_year),
            )
            if item.amount is not None:
                cursor.execute("INSERT INTO fee_structure(class_name, fee_type, amount, academic_year) VALUES (%s, %s, %s, %s)",
                               (class_name, head["name"], Decimal(str(item.amount)), data.academic_year))
        connection.commit()
    return {"message": "Fee structure saved.", "updated": len(data.items)}


@router.get("/fees/overview")
def get_fee_overview(
    academic_year: str = Query(default_factory=_default_academic_year),
):
    """Return receipt totals and an April-to-March collection series.

    This uses the existing ``fee_payments`` table, so no migration is needed
    for the overview. Only rows marked Paid count as collected revenue.
    """
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        start_year = int(academic_year[:4])
        start_date = f"{start_year}-04-01"
        end_date = f"{start_year + 1}-03-31"

        with db_cursor(dictionary=True) as (cursor, _):
            cursor.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount_paid ELSE 0 END), 0) AS collected,
                    COALESCE(SUM(CASE WHEN status <> 'Paid' THEN amount_paid ELSE 0 END), 0) AS outstanding,
                    COALESCE(SUM(amount_paid), 0) AS billed,
                    COALESCE(SUM(status = 'Paid'), 0) AS transactions
                FROM fee_payments
                WHERE payment_date BETWEEN %s AND %s
                """,
                (start_date, end_date),
            )
            totals = cursor.fetchone() or {}

            cursor.execute(
                """
                SELECT MONTH(payment_date) AS month_number,
                       COALESCE(SUM(amount_paid), 0) AS amount
                FROM fee_payments
                WHERE payment_date BETWEEN %s AND %s AND status = 'Paid'
                GROUP BY MONTH(payment_date)
                """,
                (start_date, end_date),
            )
            payments_by_month = {
                row["month_number"]: float(row["amount"] or 0)
                for row in cursor.fetchall()
            }

            cursor.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM fee_payments
                WHERE payment_date BETWEEN %s AND %s
                GROUP BY status
                """,
                (start_date, end_date),
            )
            status_counts = {"Paid": 0, "Partial": 0, "Pending": 0}
            for row in cursor.fetchall():
                if row["status"] in status_counts:
                    status_counts[row["status"]] = int(row["count"] or 0)

        months = [(4, "Apr"), (5, "May"), (6, "Jun"), (7, "Jul"), (8, "Aug"), (9, "Sep"),
                  (10, "Oct"), (11, "Nov"), (12, "Dec"), (1, "Jan"), (2, "Feb"), (3, "Mar")]
        return {
            "academic_year": academic_year,
            "summary": {
                "collected": float(totals.get("collected") or 0),
                "outstanding": float(totals.get("outstanding") or 0),
                "billed": float(totals.get("billed") or 0),
                "transactions": int(totals.get("transactions") or 0),
            },
            "monthly_collections": [
                {"label": label, "amount": payments_by_month.get(month, 0)}
                for month, label in months
            ],
            "payment_statuses": status_counts,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load fee overview")
        raise HTTPException(status_code=500, detail="Unable to load fee overview.")


@router.get("/fees/payment-records")
def get_class_payment_records(
    academic_year: str = Query(default_factory=_default_academic_year),
):
    """Return class-level totals for the payment-records tab."""
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        start_year = int(academic_year[:4])
        start_date, end_date = f"{start_year}-04-01", f"{start_year + 1}-03-31"
        classes = [("KIDSCARE", "Kids Care"), ("NUR", "NUR"), ("LKG", "LKG"), ("UKG", "UKG"),
                   *[(str(number), f"Class {number}") for number in range(1, 13)]]

        with db_cursor(dictionary=True) as (cursor, _):
            # 1) Students per class
            cursor.execute("""SELECT UPPER(TRIM(REPLACE(`class`, 'Class ', ''))) AS class_key,
                              COUNT(*) AS total_students FROM student_personal_details
                              GROUP BY UPPER(TRIM(REPLACE(`class`, 'Class ', '')))""")
            student_counts = {row["class_key"]: int(row["total_students"] or 0) for row in cursor.fetchall()}

            # 2) Active fee heads + yearly multipliers
            active_heads = {
                str(head.get("name", "")).strip().lower(): head
                for head in _get_fee_heads(cursor, academic_year)
                if head.get("is_active", True)
            }
            multipliers = {"monthly": 12, "quarterly": 4, "half_yearly": 2, "yearly": 1, "one_time": 1}

            # 3) Fee structure: what each class is currently charged
            cursor.execute("""SELECT fee_id, UPPER(TRIM(REPLACE(class_name, 'Class ', ''))) AS class_key,
                              fee_type, amount FROM fee_structure
                              WHERE academic_year = %s ORDER BY fee_id DESC""", (academic_year,))
            fee_per_student, saved_heads, charged = {}, set(), set()
            for row in cursor.fetchall():
                head = active_heads.get(str(row["fee_type"] or "").strip().lower())
                if not head:
                    continue
                class_key = row["class_key"]
                saved_key = (class_key, int(head.get("head_id", 0)))
                if saved_key in saved_heads:
                    continue
                saved_heads.add(saved_key)
                amount = float(row["amount"] or 0)
                if amount <= 0:
                    continue  # blank or 0 in Fee Structure = not charged
                charged.add((class_key, str(head.get("name", "")).strip().lower()))
                frequency = head.get("frequency", "yearly")
                fee_per_student[class_key] = fee_per_student.get(class_key, 0) + (
                    amount * multipliers.get(frequency, 1)
                )

            # 4) Payments received, only for fees that are currently charged
            _ensure_fee_period_column(cursor)
            period_keys = _period_keys(start_year, academic_year)
            placeholders = ",".join(["%s"] * len(period_keys))
            cursor.execute(f"""SELECT UPPER(TRIM(REPLACE(class_name, 'Class ', ''))) AS class_key,
                              fee_type,
                              COALESCE(SUM(amount_paid), 0) AS amount,
                              COUNT(*) AS cnt
                              FROM fee_payments
                              WHERE fee_period IN ({placeholders}) AND status IN ('Paid', 'Partial')
                              GROUP BY class_key, fee_type""", tuple(period_keys))
            received_by_class = {}
            for row in cursor.fetchall():
                key = (row["class_key"], str(row["fee_type"] or "").strip().lower())
                if key not in charged:
                    continue  # payment for a fee that isn't in Fee Structure -> ignore
                entry = received_by_class.setdefault(row["class_key"], {"received": 0.0, "transactions": 0})
                entry["received"] += float(row["amount"] or 0)
                entry["transactions"] += int(row["cnt"] or 0)

        records = []
        for class_key, class_name in classes:
            students = student_counts.get(class_key, 0)
            total_fee = round(fee_per_student.get(class_key, 0) * students, 2)
            payment = received_by_class.get(class_key, {})
            received = payment.get("received", 0)
            records.append({"class_key": class_key, "class_name": class_name, "total_students": students,
                            "total_fee": total_fee, "received_amount": received,
                            "remaining_amount": max(total_fee - received, 0), "transactions": payment.get("transactions", 0)})

        return {"academic_year": academic_year,
                "summary": {"revenue": round(sum(row["total_fee"] for row in records), 2),
                            "collected": round(sum(row["received_amount"] for row in records), 2),
                            "transactions": sum(row["transactions"] for row in records)},
                "classes": records}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load class payment records")
        raise HTTPException(status_code=500, detail="Unable to load payment records.")


# ---------------------------------------------------------------------------
# Per-student fee views (Fees > Payment Records > View Students > View More)
#
# Admin-entered payments are stored in ``fee_payments`` with a ``fee_period``:
#   "YYYY-MM"          one installment of a Monthly fee head
#   "ALL:<year range>"  the whole year's amount of any other fee head
# Only rows with a fee_period, status Paid/Partial, count as money received.
# ---------------------------------------------------------------------------
YEARLY_MULTIPLIERS = {"monthly": 12, "quarterly": 4, "half_yearly": 2, "yearly": 1, "one_time": 1}
CLASS_KEYS = {"KIDSCARE", "NUR", "LKG", "UKG", *[str(number) for number in range(1, 13)]}
_FEE_PERIOD_READY = False


def _ensure_fee_period_column(cursor) -> None:
    """Add fee_payments.fee_period once, if the table does not have it yet."""
    global _FEE_PERIOD_READY
    if _FEE_PERIOD_READY:
        return
    cursor.execute(
        """SELECT COUNT(*) AS n FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments' AND COLUMN_NAME = 'fee_period'"""
    )
    if not int((cursor.fetchone() or {}).get("n") or 0):
        cursor.execute("ALTER TABLE fee_payments ADD COLUMN fee_period VARCHAR(20) NULL AFTER fee_type")
    _FEE_PERIOD_READY = True


def _month_start(start_year: int, index: int) -> date:
    """First day of the index-th month of the academic year (0 = April)."""
    return date(start_year if index < 9 else start_year + 1, (index + 3) % 12 + 1, 1)


def _period_keys(start_year: int, academic_year: str) -> list[str]:
    """Every fee_period value that belongs to one academic year."""
    return [_month_start(start_year, index).strftime("%Y-%m") for index in range(12)] + [f"ALL:{academic_year}"]


def _period_label(period_key: str) -> str:
    if period_key.startswith("ALL"):
        return "Full year"
    return date.fromisoformat(f"{period_key}-01").strftime("%b %Y")


def _class_fee_items(cursor, academic_year: str, class_key: str) -> list[dict]:
    """Fees currently charged to one class, in fee-head order.

    Same rules as the Payment Records tab: only active fee heads count, and a
    blank or 0 amount in Fee Structure means "not charged".
    """
    heads = [head for head in _get_fee_heads(cursor, academic_year) if head.get("is_active", True)]
    active_heads = {str(head.get("name", "")).strip().lower(): head for head in heads}
    order = {int(head.get("head_id", 0)): position for position, head in enumerate(heads)}
    cursor.execute(
        """SELECT fee_id, fee_type, amount FROM fee_structure
           WHERE academic_year = %s
             AND UPPER(TRIM(REPLACE(class_name, 'Class ', ''))) = %s
           ORDER BY fee_id DESC""",
        (academic_year, class_key),
    )
    items, seen = [], set()
    for row in cursor.fetchall():
        head = active_heads.get(str(row["fee_type"] or "").strip().lower())
        if not head:
            continue
        head_id = int(head.get("head_id", 0))
        if head_id in seen:
            continue
        seen.add(head_id)
        amount = float(row["amount"] or 0)
        if amount <= 0:
            continue
        items.append({"head_id": head_id, "name": str(head.get("name", "")).strip(),
                      "frequency": head.get("frequency", "yearly"),
                      "due_day": head.get("due_day"), "amount": amount})
    items.sort(key=lambda item: order.get(item["head_id"], 0))
    return items


def _class_fee_plan(cursor, academic_year: str, class_key: str) -> tuple[float, set]:
    """Return (yearly fee per student, charged fee-head names) for one class."""
    items = _class_fee_items(cursor, academic_year, class_key)
    total = sum(item["amount"] * YEARLY_MULTIPLIERS.get(item["frequency"], 1) for item in items)
    return total, {item["name"].lower() for item in items}


def _status_for(paid: float, amount: float, due: date | None, today: date) -> str:
    if paid >= amount - 0.005:
        return "Paid"
    if paid > 0:
        return "Partial"
    if due and due < today:
        return "Overdue"
    return "Pending"


def _build_monthly_schedule(items: list[dict], start_year: int, records: dict, today: date) -> list[dict]:
    """One row per month (April..March) for each Monthly fee head."""
    rows = []
    for index in range(12):
        first = _month_start(start_year, index)
        period_key = first.strftime("%Y-%m")
        for item in items:
            record = records.get((item["name"].lower(), period_key))
            paid = min(round(record["amount"], 2), item["amount"]) if record else 0.0
            due = date(first.year, first.month, int(item["due_day"])) if item.get("due_day") else None
            rows.append({"period": first.strftime("%b %Y"), "period_key": period_key,
                         "fee_type": item["name"], "amount": item["amount"], "paid_amount": paid,
                         "status": _status_for(paid, item["amount"], due, today),
                         "due_date": due.isoformat() if due else None,
                         "payment_date": record["payment_date"].isoformat() if record else None,
                         "payment_mode": record["payment_mode"] if record else None,
                         "remarks": record["remarks"] if record else None})
    return rows


def _build_other_fees(items: list[dict], academic_year: str, start_year: int, records: dict, today: date) -> list[dict]:
    """One row per non-monthly fee head, with the whole year's amount for that head."""
    rows = []
    for item in items:
        installments = YEARLY_MULTIPLIERS.get(item["frequency"], 1)
        total = round(item["amount"] * installments, 2)
        record = records.get((item["name"].lower(), f"ALL:{academic_year}"))
        paid = min(round(record["amount"], 2), total) if record else 0.0
        first = _month_start(start_year, 0)
        due = date(first.year, first.month, int(item["due_day"])) if item.get("due_day") else None
        rows.append({"fee_type": item["name"], "frequency": item["frequency"], "period_key": "ALL",
                     "unit_amount": item["amount"], "installments": installments,
                     "total_amount": total, "paid_amount": paid,
                     "status": _status_for(paid, total, due, today),
                     "due_date": due.isoformat() if due else None,
                     "payment_date": record["payment_date"].isoformat() if record else None,
                     "payment_mode": record["payment_mode"] if record else None,
                     "remarks": record["remarks"] if record else None})
    return rows


@router.get("/fees/class-students")
def get_class_student_fees(
    class_key: str = Query(...),
    academic_year: str = Query(default_factory=_default_academic_year),
):
    """Total / paid / pending fee for every student of one class."""
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        class_key = class_key.strip().upper()
        if class_key not in CLASS_KEYS:
            raise HTTPException(status_code=400, detail="Unknown class.")
        start_year = int(academic_year[:4])

        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_fee_period_column(cursor)
            total_fee, charged = _class_fee_plan(cursor, academic_year, class_key)
            cursor.execute("SELECT student_id FROM student_personal_details WHERE `class` = %s", (class_key,))
            student_ids = [row["student_id"] for row in cursor.fetchall()]

            paid_by_student = {}
            if student_ids and charged:
                id_marks = ",".join(["%s"] * len(student_ids))
                period_keys = _period_keys(start_year, academic_year)
                period_marks = ",".join(["%s"] * len(period_keys))
                cursor.execute(
                    f"""SELECT student_id, fee_type, COALESCE(SUM(amount_paid), 0) AS amount
                        FROM fee_payments
                        WHERE student_id IN ({id_marks}) AND status IN ('Paid', 'Partial')
                          AND fee_period IN ({period_marks})
                        GROUP BY student_id, fee_type""",
                    (*student_ids, *period_keys),
                )
                for row in cursor.fetchall():
                    if str(row["fee_type"] or "").strip().lower() in charged:
                        paid_by_student[row["student_id"]] = paid_by_student.get(row["student_id"], 0) + float(row["amount"] or 0)

        students = []
        for student_id in student_ids:
            paid = round(paid_by_student.get(student_id, 0), 2)
            students.append({"student_id": student_id, "total_fee": round(total_fee, 2),
                             "paid_amount": paid, "pending_amount": round(max(total_fee - paid, 0), 2)})
        return {"academic_year": academic_year, "class_key": class_key, "students": students}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load class student fees")
        raise HTTPException(status_code=500, detail="Unable to load student fees.")


def _overdue_amount(items: list[dict], start_year: int, academic_year: str, records: dict, today: date) -> float:
    """Unpaid part of every installment whose due date has already passed.

    ``records`` maps (fee head name in lower case, fee_period) to the amount received.
    """
    overdue = 0.0
    for item in items:
        if not item.get("due_day"):
            continue
        name = item["name"].lower()
        if item["frequency"] == "monthly":
            for index in range(12):
                first = _month_start(start_year, index)
                if date(first.year, first.month, int(item["due_day"])) < today:
                    paid = min(records.get((name, first.strftime("%Y-%m")), 0.0), item["amount"])
                    overdue += item["amount"] - paid
        else:
            first = _month_start(start_year, 0)
            if date(first.year, first.month, int(item["due_day"])) < today:
                total = item["amount"] * YEARLY_MULTIPLIERS.get(item["frequency"], 1)
                overdue += total - min(records.get((name, f"ALL:{academic_year}"), 0.0), total)
    return round(overdue, 2)


@router.get("/fees/all-students")
def get_all_student_fees(academic_year: str = Query(default_factory=_default_academic_year)):
    """Total / paid / pending / overdue fee for every student (Fees > Students tab)."""
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        start_year = int(academic_year[:4])

        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_fee_period_column(cursor)
            cursor.execute("SELECT student_id, `class` AS class_key FROM student_personal_details WHERE `class` IS NOT NULL")
            students = cursor.fetchall()

            items_by_class = {}
            for class_key in {str(row["class_key"]).strip().upper() for row in students}:
                items_by_class[class_key] = _class_fee_items(cursor, academic_year, class_key)

            period_keys = _period_keys(start_year, academic_year)
            period_marks = ",".join(["%s"] * len(period_keys))
            cursor.execute(
                f"""SELECT student_id, fee_type, fee_period, COALESCE(SUM(amount_paid), 0) AS amount
                    FROM fee_payments
                    WHERE status IN ('Paid', 'Partial') AND fee_period IN ({period_marks})
                    GROUP BY student_id, fee_type, fee_period""",
                tuple(period_keys),
            )
            records_by_student = {}
            for row in cursor.fetchall():
                key = (str(row["fee_type"] or "").strip().lower(), row["fee_period"])
                records_by_student.setdefault(row["student_id"], {})[key] = float(row["amount"] or 0)

        today = date.today()
        result = []
        for row in students:
            class_key = str(row["class_key"]).strip().upper()
            items = items_by_class[class_key]
            total_fee = sum(item["amount"] * YEARLY_MULTIPLIERS.get(item["frequency"], 1) for item in items)
            charged = {item["name"].lower() for item in items}
            records = records_by_student.get(row["student_id"], {})
            paid = round(sum(amount for (fee_type, _), amount in records.items() if fee_type in charged), 2)
            result.append({"student_id": row["student_id"], "class_key": class_key,
                           "total_fee": round(total_fee, 2), "paid_amount": paid,
                           "pending_amount": round(max(total_fee - paid, 0), 2),
                           "overdue_amount": _overdue_amount(items, start_year, academic_year, records, today)})
        return {"academic_year": academic_year, "students": result}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load all student fees")
        raise HTTPException(status_code=500, detail="Unable to load student fees.")


@router.get("/fees/student-payments")
def get_student_payment_history(
    student_id: int = Query(gt=0),
    academic_year: str = Query(default_factory=_default_academic_year),
):
    """Monthly fee schedule, other fees and receipt history of one student."""
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        start_year = int(academic_year[:4])

        with db_cursor(dictionary=True) as (cursor, _):
            _ensure_fee_period_column(cursor)
            cursor.execute("SELECT `class` AS class_key FROM student_personal_details WHERE student_id = %s", (student_id,))
            student = cursor.fetchone()
            if not student:
                raise HTTPException(status_code=404, detail="Student not found.")
            class_key = str(student["class_key"] or "").strip().upper()
            items = _class_fee_items(cursor, academic_year, class_key)
            total_fee = sum(item["amount"] * YEARLY_MULTIPLIERS.get(item["frequency"], 1) for item in items)
            charged = {item["name"].lower() for item in items}

            period_keys = _period_keys(start_year, academic_year)
            period_marks = ",".join(["%s"] * len(period_keys))
            cursor.execute(
                f"""SELECT payment_id, fee_type, fee_period, amount_paid, payment_date, payment_mode, status, remarks
                    FROM fee_payments
                    WHERE student_id = %s AND fee_period IN ({period_marks})
                    ORDER BY payment_date, payment_id""",
                (student_id, *period_keys),
            )
            payments, records = [], {}
            for row in cursor.fetchall():
                fee_type = str(row["fee_type"] or "").strip()
                if fee_type.lower() not in charged:
                    continue  # fee is not (or no longer) in Fee Structure
                amount = float(row["amount_paid"] or 0)
                if row["status"] in ("Paid", "Partial"):
                    records[(fee_type.lower(), row["fee_period"])] = {
                        "amount": amount, "payment_date": row["payment_date"],
                        "payment_mode": row["payment_mode"], "remarks": row["remarks"]}
                payments.append({
                    "payment_id": row["payment_id"],
                    "month": _period_label(row["fee_period"]),
                    "fee_type": row["fee_type"],
                    "amount_paid": amount,
                    "payment_date": row["payment_date"].isoformat(),
                    "payment_mode": row["payment_mode"],
                    "status": row["status"],
                    "remarks": row["remarks"],
                })

        today = date.today()
        schedule = _build_monthly_schedule([i for i in items if i["frequency"] == "monthly"], start_year, records, today)
        other_fees = _build_other_fees([i for i in items if i["frequency"] != "monthly"], academic_year, start_year, records, today)
        paid = sum(row["paid_amount"] for row in schedule) + sum(row["paid_amount"] for row in other_fees)
        return {"academic_year": academic_year, "student_id": student_id, "class_key": class_key,
                "summary": {"total_fee": round(total_fee, 2), "paid_amount": round(paid, 2),
                            "pending_amount": round(max(total_fee - paid, 0), 2)},
                "schedule": schedule, "other_fees": other_fees, "payments": payments}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load student payment history")
        raise HTTPException(status_code=500, detail="Unable to load payment history.")


@router.put("/fees/student-payments")
def update_student_fee_payment(data: FeePaymentUpdate):
    """Admin marks one month (or one non-monthly fee) as Paid, Partial or Pending."""
    academic_year = FeeOverviewQuery(academic_year=data.academic_year).academic_year
    start_year = int(academic_year[:4])
    period_key = f"ALL:{academic_year}" if data.period == "ALL" else data.period
    if period_key not in _period_keys(start_year, academic_year):
        raise HTTPException(status_code=400, detail="That month is outside the selected academic year.")
    try:
        payment_date = date.fromisoformat(data.payment_date) if data.payment_date else date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payment date.")

    try:
        with db_cursor(dictionary=True, autocommit=False) as (cursor, connection):
            _ensure_fee_period_column(cursor)
            cursor.execute("SELECT `class` AS class_key FROM student_personal_details WHERE student_id = %s", (data.student_id,))
            student = cursor.fetchone()
            if not student:
                raise HTTPException(status_code=404, detail="Student not found.")
            class_key = str(student["class_key"] or "").strip().upper()

            items = _class_fee_items(cursor, academic_year, class_key)
            item = next((i for i in items if i["name"].lower() == data.fee_type.strip().lower()), None)
            if not item:
                raise HTTPException(status_code=400, detail="This fee is not set in Fee Structure for the student's class.")
            is_monthly = item["frequency"] == "monthly"
            if is_monthly == (data.period == "ALL"):
                raise HTTPException(status_code=400, detail="The period does not match this fee's frequency.")
            due = item["amount"] if is_monthly else round(item["amount"] * YEARLY_MULTIPLIERS.get(item["frequency"], 1), 2)

            cursor.execute(
                "SELECT payment_id FROM fee_payments WHERE student_id = %s AND fee_type = %s AND fee_period = %s ORDER BY payment_id",
                (data.student_id, item["name"], period_key),
            )
            existing = [row["payment_id"] for row in cursor.fetchall()]

            if data.status == "Pending":
                cursor.execute("DELETE FROM fee_payments WHERE student_id = %s AND fee_type = %s AND fee_period = %s",
                               (data.student_id, item["name"], period_key))
                connection.commit()
                return {"message": "Marked as pending."}

            if data.status == "Paid":
                amount = due
            else:
                if data.amount_paid is None or not (0 < data.amount_paid < due):
                    raise HTTPException(status_code=400, detail=f"Enter an amount greater than 0 and less than {due:g}.")
                amount = round(data.amount_paid, 2)
            values = (Decimal(str(amount)), payment_date, data.payment_mode or "Cash", data.status, data.remarks or None)

            if existing:
                cursor.execute(
                    """UPDATE fee_payments SET amount_paid = %s, payment_date = %s, payment_mode = %s,
                       status = %s, remarks = %s WHERE payment_id = %s""",
                    (*values, existing[0]),
                )
                for extra_id in existing[1:]:  # keep exactly one record per installment
                    cursor.execute("DELETE FROM fee_payments WHERE payment_id = %s", (extra_id,))
            else:
                name = (data.student_name or "").strip()[:60] or f"Student {data.student_id}"
                cursor.execute(
                    """INSERT INTO fee_payments(student_id, student_name, class_name, fee_type, fee_period,
                                                amount_paid, payment_date, payment_mode, status, remarks)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (data.student_id, name, class_key, item["name"], period_key, *values),
                )
            connection.commit()
        return {"message": "Payment updated."}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to update student fee payment")
        raise HTTPException(status_code=500, detail="Unable to save the payment.")