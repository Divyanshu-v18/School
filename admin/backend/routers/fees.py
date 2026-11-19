"""Read-only data API for the first Fees overview tab."""

import json
import logging
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from database import db_cursor
from models.fee import FeeHeadIn, FeeOverviewQuery, FeePaymentUpdate, FeeStructureBulk, FineWaiverUpdate

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Fees"])
FREQUENCIES = {"monthly", "quarterly", "half_yearly", "yearly", "one_time"}


def _today() -> date:
    """Today's date in India (the server itself may run in UTC)."""
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


def _default_academic_year() -> str:
    today = _today()
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
                      "due_day": data.due_day, "description": data.description, "is_active": True,
                      "late_fee": data.late_fee if data.frequency == "monthly" else None})
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
        target.update({"name": data.name, "frequency": data.frequency, "due_day": data.due_day, "description": data.description,
                       "late_fee": data.late_fee if data.frequency == "monthly" else None})
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
            _ensure_waiver_table(cursor)
            cursor.execute("UPDATE fee_fine_waivers SET fee_type = %s WHERE fee_type = %s AND academic_year = %s",
                           (data.name, old_name, academic_year))
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
    """Return class-level totals for the payment-records tab.

    Every student's fees are worked out one by one (including late fines), then added up per class.
    """
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        start_year = int(academic_year[:4])
        classes = [("KIDSCARE", "Kids Care"), ("NUR", "NUR"), ("LKG", "LKG"), ("UKG", "UKG"),
                   *[(str(number), f"Class {number}") for number in range(1, 13)]]

        with db_cursor(dictionary=True) as (cursor, _):
            cursor.execute("""SELECT student_id, UPPER(TRIM(REPLACE(`class`, 'Class ', ''))) AS class_key
                              FROM student_personal_details""")
            students = cursor.fetchall()
            items_by_class = {key: _class_fee_items(cursor, academic_year, key)
                              for key in {row["class_key"] for row in students if row["class_key"]}}
            records = _load_period_records(cursor, academic_year)
            waivers = _load_waivers(cursor, academic_year)

        today = _today()
        totals = {}
        for row in students:
            entry = totals.setdefault(row["class_key"], {"students": 0, "total": 0.0, "received": 0.0,
                                                         "remaining": 0.0, "transactions": 0})
            entry["students"] += 1
            if not row["class_key"]:
                continue
            position = _student_position(items_by_class[row["class_key"]], academic_year, start_year,
                                         records.get(row["student_id"], {}), waivers.get(row["student_id"]), today)
            entry["total"] += position["total"]
            entry["received"] += position["paid"]
            entry["remaining"] += position["pending"]
            entry["transactions"] += position["transactions"]

        result = []
        for class_key, class_name in classes:
            entry = totals.get(class_key, {"students": 0, "total": 0.0, "received": 0.0, "remaining": 0.0, "transactions": 0})
            result.append({"class_key": class_key, "class_name": class_name, "total_students": entry["students"],
                           "total_fee": round(entry["total"], 2), "received_amount": round(entry["received"], 2),
                           "remaining_amount": round(entry["remaining"], 2), "transactions": entry["transactions"]})

        return {"academic_year": academic_year,
                "summary": {"revenue": round(sum(row["total_fee"] for row in result), 2),
                            "collected": round(sum(row["received_amount"] for row in result), 2),
                            "transactions": sum(row["transactions"] for row in result)},
                "classes": result}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load class payment records")
        raise HTTPException(status_code=500, detail="Unable to load payment records.")


# ---------------------------------------------------------------------------
# Per-student fee views (Fees > Students, class student lists, student profile)
#
# Admin-entered payments are stored in ``fee_payments`` with a ``fee_period``:
#   "YYYY-MM"          one installment of a Monthly fee head
#   "ALL:<year range>"  the whole year's amount of any other fee head
# Only rows with a fee_period, status Paid/Partial, count as money received.
#
# Late fine: a Monthly fee head can carry a ``late_fee``. A month is late when it is not paid
# in full on or before its due date. The fine is added to that month's amount due unless it is
# waived for the month, or for the student for the whole year (table ``fee_fine_waivers``).
# ---------------------------------------------------------------------------
YEARLY_MULTIPLIERS = {"monthly": 12, "quarterly": 4, "half_yearly": 2, "yearly": 1, "one_time": 1}
CLASS_KEYS = {"KIDSCARE", "NUR", "LKG", "UKG", *[str(number) for number in range(1, 13)]}
_FEE_PERIOD_READY = False
_WAIVER_TABLE_READY = False


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


def _ensure_waiver_table(cursor) -> None:
    """Make sure the late-fine waiver table exists.

    It is only created when it is missing. (Running CREATE TABLE IF NOT EXISTS every time would
    fail for a database user that has no CREATE permission, even when the table is already there.)
    """
    global _WAIVER_TABLE_READY
    if _WAIVER_TABLE_READY:
        return
    cursor.execute(
        """SELECT COUNT(*) AS n FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_fine_waivers'"""
    )
    if not int((cursor.fetchone() or {}).get("n") or 0):
        cursor.execute(
            """CREATE TABLE fee_fine_waivers (
                 waiver_id INT NOT NULL AUTO_INCREMENT,
                 student_id INT NOT NULL,
                 academic_year VARCHAR(20) NOT NULL,
                 fee_type VARCHAR(50) NOT NULL,
                 fee_period VARCHAR(20) NOT NULL DEFAULT 'ALL',
                 reason VARCHAR(255) NULL,
                 created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                 PRIMARY KEY (waiver_id),
                 UNIQUE KEY uq_fine_waiver (student_id, academic_year, fee_type, fee_period)
               ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""
        )
    _WAIVER_TABLE_READY = True


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
                      "due_day": head.get("due_day"), "amount": amount,
                      "late_fee": float(head.get("late_fee") or 0) if head.get("frequency") == "monthly" else 0.0})
    items.sort(key=lambda item: order.get(item["head_id"], 0))
    return items


def _load_period_records(cursor, academic_year: str, student_ids: list | None = None) -> dict:
    """Money received per student: {student_id: {(fee head, fee_period): {...}}}."""
    _ensure_fee_period_column(cursor)
    period_keys = _period_keys(int(academic_year[:4]), academic_year)
    marks = ",".join(["%s"] * len(period_keys))
    sql = f"""SELECT student_id, fee_type, fee_period, amount_paid, payment_date, payment_mode, remarks
              FROM fee_payments
              WHERE status IN ('Paid', 'Partial') AND fee_period IN ({marks})"""
    params = list(period_keys)
    if student_ids is not None:
        sql += f" AND student_id IN ({','.join(['%s'] * len(student_ids))})"
        params += list(student_ids)
    cursor.execute(sql + " ORDER BY payment_date, payment_id", tuple(params))
    records = {}
    for row in cursor.fetchall():
        key = (str(row["fee_type"] or "").strip().lower(), row["fee_period"])
        records.setdefault(row["student_id"], {})[key] = {
            "amount": float(row["amount_paid"] or 0), "payment_date": row["payment_date"],
            "payment_mode": row["payment_mode"], "remarks": row["remarks"]}
    return records


def _load_waivers(cursor, academic_year: str, student_ids: list | None = None) -> dict:
    """Late-fine waivers per student: {student_id: {"all": bool, "months": {(fee head, period)}}}."""
    _ensure_waiver_table(cursor)
    sql = "SELECT student_id, fee_type, fee_period FROM fee_fine_waivers WHERE academic_year = %s"
    params = [academic_year]
    if student_ids is not None:
        sql += f" AND student_id IN ({','.join(['%s'] * len(student_ids))})"
        params += list(student_ids)
    cursor.execute(sql, tuple(params))
    waivers = {}
    for row in cursor.fetchall():
        entry = waivers.setdefault(row["student_id"], {"all": False, "months": set()})
        if row["fee_type"] == "*" and row["fee_period"] == "ALL":
            entry["all"] = True
        else:
            entry["months"].add((str(row["fee_type"]).strip().lower(), row["fee_period"]))
    return waivers


def _status_for(paid: float, amount: float, due: date | None, today: date) -> str:
    if paid >= amount - 0.005:
        return "Paid"
    if paid > 0:
        return "Partial"
    if due and due < today:
        return "Overdue"
    return "Pending"


def _installment_due(item: dict, first: date) -> date | None:
    """Due date of a Monthly fee in the month starting at ``first`` (None if the head has no due day)."""
    return date(first.year, first.month, int(item["due_day"])) if item.get("due_day") else None


def _late_fine(late_fee: float, base: float, due: date | None, record: dict | None,
               waived: bool, today: date) -> tuple[float, bool]:
    """Return (fine to pay, month is late).

    A month is on time only if it was paid in full on or before its due date. Otherwise it is late
    once the due date has passed, or when a payment was made after the due date.
    """
    if not late_fee or not due:
        return 0.0, False
    on_time = record is not None and record["amount"] >= base - 0.005 and record["payment_date"] <= due
    late = (not on_time) and (today > due or (record is not None and record["payment_date"] > due))
    return (0.0 if waived else float(late_fee)) if late else 0.0, late


def _build_monthly_schedule(items: list[dict], start_year: int, records: dict, waivers: dict | None, today: date) -> list[dict]:
    """One row per month (April..March) for each Monthly fee head, including any late fine."""
    waivers = waivers or {"all": False, "months": set()}
    rows = []
    for index in range(12):
        first = _month_start(start_year, index)
        period_key = first.strftime("%Y-%m")
        for item in items:
            name = item["name"].lower()
            record = records.get((name, period_key))
            due = _installment_due(item, first)
            waived_month = (name, period_key) in waivers["months"]
            fine, late = _late_fine(item.get("late_fee"), item["amount"], due, record,
                                    waivers["all"] or waived_month, today)
            total_due = round(item["amount"] + fine, 2)
            paid = min(round(record["amount"], 2), total_due) if record else 0.0
            rows.append({"period": first.strftime("%b %Y"), "period_key": period_key,
                         "fee_type": item["name"], "amount": item["amount"],
                         "late_fee": float(item.get("late_fee") or 0), "fine": fine,
                         "fine_waived": bool(late and (waivers["all"] or waived_month)),
                         "waived_month": waived_month, "total_due": total_due, "paid_amount": paid,
                         "status": _status_for(paid, total_due, due, today),
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
                     "total_amount": total, "total_due": total, "paid_amount": paid,
                     "status": _status_for(paid, total, due, today),
                     "due_date": due.isoformat() if due else None,
                     "payment_date": record["payment_date"].isoformat() if record else None,
                     "payment_mode": record["payment_mode"] if record else None,
                     "remarks": record["remarks"] if record else None})
    return rows


def _student_position(items: list[dict], academic_year: str, start_year: int,
                      records: dict, waivers: dict | None, today: date) -> dict:
    """Everything owed and paid by one student for the academic year."""
    monthly = _build_monthly_schedule([i for i in items if i["frequency"] == "monthly"], start_year, records, waivers, today)
    other = _build_other_fees([i for i in items if i["frequency"] != "monthly"], academic_year, start_year, records, today)
    rows = monthly + other
    base = sum(row["amount"] for row in monthly) + sum(row["total_amount"] for row in other)
    fine = sum(row["fine"] for row in monthly)
    total = base + fine
    paid = sum(row["paid_amount"] for row in rows)
    overdue = sum(max(row["total_due"] - row["paid_amount"], 0) for row in rows
                  if row["due_date"] and date.fromisoformat(row["due_date"]) < today)
    return {"schedule": monthly, "other_fees": other, "base": round(base, 2), "fine": round(fine, 2),
            "total": round(total, 2), "paid": round(paid, 2), "pending": round(max(total - paid, 0), 2),
            "overdue": round(overdue, 2), "transactions": sum(1 for row in rows if row["paid_amount"] > 0)}


def _student_rows(students: list, items_by_class: dict, academic_year: str, start_year: int,
                  records: dict, waivers: dict, today: date) -> list[dict]:
    result = []
    for row in students:
        class_key = str(row["class_key"]).strip().upper()
        position = _student_position(items_by_class[class_key], academic_year, start_year,
                                     records.get(row["student_id"], {}), waivers.get(row["student_id"]), today)
        result.append({"student_id": row["student_id"], "class_key": class_key,
                       "total_fee": position["total"], "late_fine": position["fine"],
                       "paid_amount": position["paid"], "pending_amount": position["pending"],
                       "overdue_amount": position["overdue"]})
    return result


@router.get("/fees/class-students")
def get_class_student_fees(
    class_key: str = Query(...),
    academic_year: str = Query(default_factory=_default_academic_year),
):
    """Total / paid / pending / overdue fee for every student of one class."""
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        class_key = class_key.strip().upper()
        if class_key not in CLASS_KEYS:
            raise HTTPException(status_code=400, detail="Unknown class.")
        start_year = int(academic_year[:4])

        with db_cursor(dictionary=True) as (cursor, _):
            cursor.execute("SELECT student_id, `class` AS class_key FROM student_personal_details WHERE `class` = %s", (class_key,))
            students = cursor.fetchall()
            items_by_class = {class_key: _class_fee_items(cursor, academic_year, class_key)}
            records = _load_period_records(cursor, academic_year)
            waivers = _load_waivers(cursor, academic_year)

        return {"academic_year": academic_year, "class_key": class_key,
                "students": _student_rows(students, items_by_class, academic_year, start_year, records, waivers, _today())}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load class student fees")
        raise HTTPException(status_code=500, detail="Unable to load student fees.")


@router.get("/fees/all-students")
def get_all_student_fees(academic_year: str = Query(default_factory=_default_academic_year)):
    """Total / paid / pending / overdue fee for every student (Fees > Students tab)."""
    try:
        academic_year = FeeOverviewQuery(academic_year=academic_year).academic_year
        start_year = int(academic_year[:4])

        with db_cursor(dictionary=True) as (cursor, _):
            cursor.execute("SELECT student_id, `class` AS class_key FROM student_personal_details WHERE `class` IS NOT NULL")
            students = cursor.fetchall()
            items_by_class = {key: _class_fee_items(cursor, academic_year, key)
                              for key in {str(row["class_key"]).strip().upper() for row in students}}
            records = _load_period_records(cursor, academic_year)
            waivers = _load_waivers(cursor, academic_year)

        return {"academic_year": academic_year,
                "students": _student_rows(students, items_by_class, academic_year, start_year, records, waivers, _today())}
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
            class_key = _student_class(cursor, student_id, required=False)
            if not class_key:
                # No class (incomplete student record): nothing is charged, and the page can say why.
                return {"academic_year": academic_year, "student_id": student_id, "class_key": "", "no_class": True,
                        "summary": {"total_fee": 0, "late_fine": 0, "paid_amount": 0, "pending_amount": 0},
                        "fine_policy": {"enabled": False, "exempt_all": False},
                        "schedule": [], "other_fees": [], "payments": []}
            items = _class_fee_items(cursor, academic_year, class_key)
            charged = {item["name"].lower() for item in items}
            waivers = _load_waivers(cursor, academic_year, [student_id]).get(student_id, {"all": False, "months": set()})

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

        position = _student_position(items, academic_year, start_year, records, waivers, _today())
        return {"academic_year": academic_year, "student_id": student_id, "class_key": class_key,
                "summary": {"total_fee": position["total"], "late_fine": position["fine"],
                            "paid_amount": position["paid"], "pending_amount": position["pending"]},
                "fine_policy": {"enabled": any(item["late_fee"] > 0 for item in items if item["frequency"] == "monthly"),
                                "exempt_all": waivers["all"]},
                "schedule": position["schedule"], "other_fees": position["other_fees"], "payments": payments}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to load student payment history")
        raise HTTPException(status_code=500, detail="Unable to load payment history.")


def _student_class(cursor, student_id: int, required: bool = True) -> str:
    """The student's class key. A student with no class (for example one whose personal details were
    never filled in) has no fees: with required=True that is an error, otherwise "" is returned."""
    cursor.execute(
        """SELECT sd.student_id, spd.`class` AS class_key
           FROM student_details sd
           LEFT JOIN student_personal_details spd ON spd.student_id = sd.student_id
           WHERE sd.student_id = %s""",
        (student_id,),
    )
    student = cursor.fetchone()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    class_key = str(student["class_key"] or "").strip().upper()
    if required and not class_key:
        raise HTTPException(status_code=400, detail="This student has no class assigned yet. Add the class in the student's profile first.")
    return class_key


def _set_waiver(cursor, student_id: int, academic_year: str, fee_type: str, period: str, waived: bool, reason=None) -> None:
    """Add or remove one late-fine waiver row."""
    _ensure_waiver_table(cursor)
    if waived:
        cursor.execute(
            """INSERT INTO fee_fine_waivers (student_id, academic_year, fee_type, fee_period, reason)
               VALUES (%s, %s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE reason = COALESCE(VALUES(reason), reason)""",
            (student_id, academic_year, fee_type, period, reason),
        )
    else:
        cursor.execute(
            "DELETE FROM fee_fine_waivers WHERE student_id = %s AND academic_year = %s AND fee_type = %s AND fee_period = %s",
            (student_id, academic_year, fee_type, period),
        )


@router.put("/fees/student-payments")
def update_student_fee_payment(data: FeePaymentUpdate):
    """Admin marks one month (or one non-monthly fee) as Paid, Partial or Pending."""
    academic_year = FeeOverviewQuery(academic_year=data.academic_year).academic_year
    start_year = int(academic_year[:4])
    period_key = f"ALL:{academic_year}" if data.period == "ALL" else data.period
    if period_key not in _period_keys(start_year, academic_year):
        raise HTTPException(status_code=400, detail="That month is outside the selected academic year.")
    try:
        payment_date = date.fromisoformat(data.payment_date) if data.payment_date else _today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payment date.")

    try:
        with db_cursor(dictionary=True, autocommit=False) as (cursor, connection):
            _ensure_fee_period_column(cursor)
            class_key = _student_class(cursor, data.student_id)

            items = _class_fee_items(cursor, academic_year, class_key)
            item = next((i for i in items if i["name"].lower() == data.fee_type.strip().lower()), None)
            if not item:
                raise HTTPException(status_code=400, detail="This fee is not set in Fee Structure for the student's class.")
            is_monthly = item["frequency"] == "monthly"
            if is_monthly == (data.period == "ALL"):
                raise HTTPException(status_code=400, detail="The period does not match this fee's frequency.")

            # late fine: waiver choice first, because it changes the amount due
            if is_monthly and data.waive_fine is not None:
                _set_waiver(cursor, data.student_id, academic_year, item["name"], period_key, bool(data.waive_fine))
            waivers = _load_waivers(cursor, academic_year, [data.student_id]).get(data.student_id, {"all": False, "months": set()})
            waived = waivers["all"] or (item["name"].lower(), period_key) in waivers["months"]

            if is_monthly:
                fine = 0.0
                if data.status != "Pending" and item["late_fee"] and not waived:
                    due_date = _installment_due(item, date.fromisoformat(f"{period_key}-01"))
                    if due_date and payment_date > due_date:
                        fine = item["late_fee"]
                due = round(item["amount"] + fine, 2)
            else:
                due = round(item["amount"] * YEARLY_MULTIPLIERS.get(item["frequency"], 1), 2)

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


@router.put("/fees/student-fine-waiver")
def update_fine_waiver(data: FineWaiverUpdate):
    """Waive late fines for a student: one month of a Monthly fee, or every month of the year ("*")."""
    academic_year = FeeOverviewQuery(academic_year=data.academic_year).academic_year
    start_year = int(academic_year[:4])
    whole_year = data.fee_type == "*"
    if whole_year != (data.period == "ALL"):
        raise HTTPException(status_code=400, detail='Use fee type "*" with period ALL for the whole year, or a fee head with a month.')
    if not whole_year and data.period not in _period_keys(start_year, academic_year):
        raise HTTPException(status_code=400, detail="That month is outside the selected academic year.")

    try:
        with db_cursor(dictionary=True, autocommit=False) as (cursor, connection):
            class_key = _student_class(cursor, data.student_id)
            fee_type = "*"
            if not whole_year:
                items = _class_fee_items(cursor, academic_year, class_key)
                item = next((i for i in items if i["name"].lower() == data.fee_type.strip().lower() and i["frequency"] == "monthly"), None)
                if not item:
                    raise HTTPException(status_code=400, detail="Late fines only apply to a Monthly fee set for the student's class.")
                fee_type = item["name"]
            _set_waiver(cursor, data.student_id, academic_year, fee_type, data.period, data.waived, (data.reason or "").strip() or None)
            connection.commit()
        return {"message": "Late fine waived." if data.waived else "Late fine will be charged."}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to update late fine waiver")
        raise HTTPException(status_code=500, detail="Unable to save the late fine setting.")