"""Fee management API: fee definitions, invoices, immutable payment ledger and advance credits."""
import json
import logging
from datetime import date
from decimal import Decimal
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query
from database import db_cursor
from models.fee import FeeHeadIn, FeeStructureBulk, FeeStructureCopy, FeePaymentIn

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Fees"])
FREQUENCIES = {"monthly", "quarterly", "half_yearly", "yearly", "one_time"}
PAYMENT_MODES = {"Cash", "UPI", "Online", "Cheque", "Bank Transfer", "Card", "Other"}


def clean_class(value: str) -> str:
    return str(value or "").strip().removeprefix("Class").strip()


def academic_year_for(period: Optional[str], payment_date) -> str:
    if period:
        try:
            year, month = map(int, str(period)[:7].split("-"))
            start = year if month >= 4 else year - 1
            return f"{start}-{start + 1}"
        except Exception:
            pass
    if payment_date:
        if isinstance(payment_date, str):
            try:
                payment_date = date.fromisoformat(str(payment_date)[:10])
            except Exception:
                pass
        if hasattr(payment_date, "year") and hasattr(payment_date, "month"):
            start = payment_date.year if payment_date.month >= 4 else payment_date.year - 1
            return f"{start}-{start + 1}"
    return "2026-2027"


def _parse_academic_year_range(academic_year: Optional[str]):
    if not academic_year:
        return None, None
    clean_ay = str(academic_year).strip()
    try:
        if "-" in clean_ay:
            parts = clean_ay.split("-")
            sy = int(parts[0].strip())
            ey = int(parts[1].strip())
            return f"{sy:04d}-04-01", f"{ey:04d}-03-31"
        else:
            sy = int(clean_ay)
            return f"{sy:04d}-04-01", f"{sy + 1:04d}-03-31"
    except Exception:
        return None, None


def _table_exists(cur, table_name: str) -> bool:
    try:
        cur.execute("SHOW TABLES LIKE %s", (table_name,))
        return bool(cur.fetchone())
    except Exception:
        return False


def audit(cur, action, entity_type, entity_id, details=None, actor=None):
    if _table_exists(cur, "fee_audit_logs"):
        try:
            cur.execute(
                """INSERT INTO fee_audit_logs(actor, action, entity_type, entity_id, details)
                   VALUES (%s,%s,%s,%s,%s)""",
                (actor, action, entity_type, entity_id,
                 json.dumps(details, default=str) if details is not None else None)
            )
            return
        except Exception:
            pass
    logger.info("Fee audit: %s %s id=%s details=%s", action, entity_type, entity_id, details)


# ---------------------------------------------------------------------------
# Fallback fee heads storage in school_settings (when fee_heads table is absent)
# ---------------------------------------------------------------------------
def _get_fallback_heads(cur) -> List[dict]:
    cur.execute("SELECT setting_value FROM school_settings WHERE setting_key = 'fee_heads'")
    row = cur.fetchone()
    if row and row.get("setting_value"):
        try:
            stored = json.loads(row["setting_value"])
            if isinstance(stored, list) and stored:
                return stored
        except Exception:
            pass

    # Initialize from existing fee_structure distinct fee_types
    cur.execute("SELECT DISTINCT fee_type FROM fee_structure WHERE fee_type IS NOT NULL AND fee_type != ''")
    types = [r["fee_type"] for r in cur.fetchall()]
    initial_heads = []
    for idx, name in enumerate(types, start=1):
        freq = "monthly" if "month" in name.lower() else ("quarterly" if "term" in name.lower() else "yearly")
        initial_heads.append({
            "head_id": idx,
            "name": name,
            "frequency": freq,
            "due_day": 10 if freq == "monthly" else None,
            "description": f"Standard {name}",
            "is_active": 1
        })
    if not initial_heads:
        initial_heads = [
            {"head_id": 1, "name": "Monthly fee", "frequency": "monthly", "due_day": 10, "description": "Tuition fee", "is_active": 1},
            {"head_id": 2, "name": "Sports Fee", "frequency": "yearly", "due_day": None, "description": "Annual sports fee", "is_active": 1},
            {"head_id": 3, "name": "Term 1 Tuition", "frequency": "quarterly", "due_day": None, "description": "Term tuition fee", "is_active": 1}
        ]
    _save_fallback_heads(cur, initial_heads)
    return initial_heads


def _save_fallback_heads(cur, heads: List[dict]):
    val = json.dumps(heads)
    cur.execute(
        """
        INSERT INTO school_settings (setting_key, setting_value)
        VALUES ('fee_heads', %s)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        """,
        (val,)
    )


# ---------------------------------------------------------------------------
# FEE HEADS ENDPOINTS
# ---------------------------------------------------------------------------
@router.get("/fees/heads")
def list_fee_heads(include_inactive: bool = False):
    with db_cursor(dictionary=True) as (cur, _):
        if _table_exists(cur, "fee_heads"):
            sql = "SELECT * FROM fee_heads"
            if not include_inactive:
                sql += " WHERE is_active = 1"
            cur.execute(sql + " ORDER BY name")
            return cur.fetchall()

        # Fallback to school_settings
        heads = _get_fallback_heads(cur)
        if not include_inactive:
            heads = [h for h in heads if h.get("is_active", 1) == 1]
        return sorted(heads, key=lambda h: h.get("name", "").lower())


@router.post("/fees/heads")
def create_fee_head(data: FeeHeadIn):
    if data.frequency not in FREQUENCIES:
        raise HTTPException(400, "Invalid fee frequency.")

    with db_cursor(dictionary=True) as (cur, _):
        if _table_exists(cur, "fee_heads"):
            cur.execute(
                """INSERT INTO fee_heads(name,frequency,due_day,description)
                   VALUES(%s,%s,%s,%s)""",
                (data.name.strip(), data.frequency, data.due_day, data.description)
            )
            head_id = cur.lastrowid
            audit(cur, "CREATE", "fee_head", head_id, data.model_dump())
            return {"head_id": head_id, "message": "Fee head created."}

        # Fallback to school_settings
        heads = _get_fallback_heads(cur)
        name_lower = data.name.strip().lower()
        if any(h.get("name", "").strip().lower() == name_lower and h.get("is_active", 1) == 1 for h in heads):
            raise HTTPException(400, "A fee head with this name already exists.")

        new_id = (max([h.get("head_id", 0) for h in heads], default=0) + 1)
        new_head = {
            "head_id": new_id,
            "name": data.name.strip(),
            "frequency": data.frequency,
            "due_day": data.due_day,
            "description": data.description,
            "is_active": 1
        }
        heads.append(new_head)
        _save_fallback_heads(cur, heads)
        audit(cur, "CREATE", "fee_head", new_id, data.model_dump())
        return {"head_id": new_id, "message": "Fee head created."}


@router.put("/fees/heads/{head_id}")
def update_fee_head(head_id: int, data: FeeHeadIn):
    if data.frequency not in FREQUENCIES:
        raise HTTPException(400, "Invalid fee frequency.")

    with db_cursor(dictionary=True) as (cur, _):
        if _table_exists(cur, "fee_heads"):
            cur.execute(
                """UPDATE fee_heads SET name=%s,frequency=%s,due_day=%s,description=%s
                   WHERE head_id=%s AND is_active=1""",
                (data.name.strip(), data.frequency, data.due_day, data.description, head_id)
            )
            if not cur.rowcount:
                raise HTTPException(404, "Fee head not found.")
            audit(cur, "UPDATE", "fee_head", head_id, data.model_dump())
            return {"message": "Fee head updated."}

        # Fallback to school_settings
        heads = _get_fallback_heads(cur)
        target = None
        for h in heads:
            if h.get("head_id") == head_id and h.get("is_active", 1) == 1:
                target = h
                break
        if not target:
            raise HTTPException(404, "Fee head not found.")

        old_name = target.get("name")
        target["name"] = data.name.strip()
        target["frequency"] = data.frequency
        target["due_day"] = data.due_day
        target["description"] = data.description

        _save_fallback_heads(cur, heads)

        # Also rename any matching fee_type in fee_structure if changed
        if old_name and old_name != target["name"] and _table_exists(cur, "fee_structure"):
            cur.execute(
                "UPDATE fee_structure SET fee_type = %s WHERE fee_type = %s",
                (target["name"], old_name)
            )

        audit(cur, "UPDATE", "fee_head", head_id, data.model_dump())
        return {"message": "Fee head updated."}


@router.delete("/fees/heads/{head_id}")
def archive_fee_head(head_id: int):
    with db_cursor(dictionary=True) as (cur, _):
        if _table_exists(cur, "fee_heads"):
            cur.execute("UPDATE fee_heads SET is_active=0 WHERE head_id=%s", (head_id,))
            if not cur.rowcount:
                raise HTTPException(404, "Fee head not found.")
            audit(cur, "ARCHIVE", "fee_head", head_id)
            return {"message": "Fee head archived; historical records preserved."}

        # Fallback to school_settings
        heads = _get_fallback_heads(cur)
        found = False
        for h in heads:
            if h.get("head_id") == head_id:
                h["is_active"] = 0
                found = True
                break
        if not found:
            raise HTTPException(404, "Fee head not found.")

        _save_fallback_heads(cur, heads)
        audit(cur, "ARCHIVE", "fee_head", head_id)
        return {"message": "Fee head archived; historical records preserved."}


# ---------------------------------------------------------------------------
# FEE STRUCTURES ENDPOINTS
# ---------------------------------------------------------------------------
@router.get("/fees/structures")
def get_fee_structures(class_name: Optional[str] = None, academic_year: Optional[str] = None):
    with db_cursor(dictionary=True) as (cur, _):
        if _table_exists(cur, "fee_structures") and _table_exists(cur, "fee_heads"):
            clauses, params = [], []
            if class_name:
                clauses.append("fs.class_name=%s")
                params.append(clean_class(class_name))
            if academic_year:
                clauses.append("fs.academic_year=%s")
                params.append(academic_year)
            sql = """SELECT fs.structure_id,fs.class_name,fs.head_id,fs.academic_year,fs.amount,
                            fh.name AS fee_type,fh.frequency
                     FROM fee_structures fs JOIN fee_heads fh ON fh.head_id=fs.head_id"""
            if clauses:
                sql += " WHERE " + " AND ".join(clauses)
            sql += " ORDER BY fs.class_name,fh.name"
            cur.execute(sql, tuple(params))
            return cur.fetchall()

        # Fallback using fee_structure table
        clauses, params = [], []
        if class_name:
            clauses.append("(class_name=%s OR class_name=%s)")
            params.extend([clean_class(class_name), class_name])
        if academic_year:
            clauses.append("academic_year=%s")
            params.append(academic_year)

        sql = "SELECT fee_id AS structure_id, class_name, fee_type, amount, academic_year FROM fee_structure"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY class_name, fee_type"

        cur.execute(sql, tuple(params))
        rows = cur.fetchall()

        heads = _get_fallback_heads(cur)
        head_by_name = {h.get("name", "").strip().lower(): h for h in heads}

        result = []
        for r in rows:
            fee_name = r.get("fee_type", "").strip()
            head = head_by_name.get(fee_name.lower())
            head_id = head.get("head_id") if head else 0
            freq = head.get("frequency") if head else "monthly"

            result.append({
                "structure_id": r["structure_id"],
                "class_name": clean_class(r["class_name"]),
                "head_id": head_id,
                "fee_type": fee_name,
                "frequency": freq,
                "academic_year": r["academic_year"],
                "amount": float(r["amount"])
            })
        return result


@router.put("/fees/structures/bulk")
def save_fee_structures(data: FeeStructureBulk):
    with db_cursor(dictionary=True, autocommit=False) as (cur, conn):
        use_v2_table = _table_exists(cur, "fee_structures") and _table_exists(cur, "fee_heads")

        if use_v2_table:
            for item in data.items:
                cls = clean_class(item.class_name)
                cur.execute("SELECT head_id FROM fee_heads WHERE head_id=%s AND is_active=1", (item.head_id,))
                if not cur.fetchone():
                    raise HTTPException(404, f"Fee head {item.head_id} not found.")
                if item.amount is None:
                    cur.execute(
                        "DELETE FROM fee_structures WHERE class_name=%s AND head_id=%s AND academic_year=%s",
                        (cls, item.head_id, data.academic_year)
                    )
                else:
                    cur.execute(
                        """INSERT INTO fee_structures(class_name,head_id,academic_year,amount)
                           VALUES(%s,%s,%s,%s)
                           ON DUPLICATE KEY UPDATE amount=VALUES(amount)""",
                        (cls, item.head_id, data.academic_year, Decimal(str(item.amount)))
                    )
        else:
            # Fallback using fee_structure table
            heads = _get_fallback_heads(cur)
            head_map = {h["head_id"]: h for h in heads}

            for item in data.items:
                cls = clean_class(item.class_name)
                head = head_map.get(item.head_id)
                if not head:
                    continue
                fee_name = head["name"]

                cur.execute(
                    """
                    DELETE FROM fee_structure
                    WHERE (class_name=%s OR class_name=%s) AND fee_type=%s AND academic_year=%s
                    """,
                    (cls, f"Class {cls}", fee_name, data.academic_year)
                )
                if item.amount is not None and float(item.amount) >= 0:
                    cur.execute(
                        """
                        INSERT INTO fee_structure (class_name, fee_type, amount, academic_year)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (cls, fee_name, Decimal(str(item.amount)), data.academic_year)
                    )

        audit(cur, "BULK_SAVE", "fee_structure", None,
              {"academic_year": data.academic_year, "count": len(data.items)})
        conn.commit()
        return {"message": "Fee structures saved.", "updated": len(data.items)}


@router.post("/fees/structures/copy")
def copy_fee_structures(data: FeeStructureCopy):
    if data.from_year == data.to_year:
        raise HTTPException(400, "Choose two different academic years.")

    with db_cursor(dictionary=True, autocommit=False) as (cur, conn):
        if _table_exists(cur, "fee_structures"):
            cur.execute("SELECT COUNT(*) AS n FROM fee_structures WHERE academic_year=%s", (data.from_year,))
            if not cur.fetchone()["n"]:
                raise HTTPException(404, "No fee structures found in source year.")
            cur.execute(
                """INSERT INTO fee_structures(class_name,head_id,academic_year,amount)
                   SELECT class_name,head_id,%s,amount FROM fee_structures WHERE academic_year=%s
                   ON DUPLICATE KEY UPDATE amount=VALUES(amount)""",
                (data.to_year, data.from_year)
            )
        else:
            cur.execute("SELECT class_name, fee_type, amount FROM fee_structure WHERE academic_year=%s", (data.from_year,))
            rows = cur.fetchall()
            if not rows:
                raise HTTPException(404, "No fee structures found in source year.")
            for r in rows:
                cur.execute(
                    "DELETE FROM fee_structure WHERE class_name=%s AND fee_type=%s AND academic_year=%s",
                    (r["class_name"], r["fee_type"], data.to_year)
                )
                cur.execute(
                    "INSERT INTO fee_structure (class_name, fee_type, amount, academic_year) VALUES (%s, %s, %s, %s)",
                    (r["class_name"], r["fee_type"], r["amount"], data.to_year)
                )

        audit(cur, "COPY_YEAR", "fee_structure", None,
              {"from_year": data.from_year, "to_year": data.to_year})
        conn.commit()
        return {"message": "Fee structures copied."}


@router.delete("/fees/structures/{structure_id}")
def delete_fee_structure(structure_id: int):
    with db_cursor(dictionary=True) as (cur, _):
        if _table_exists(cur, "fee_structures"):
            cur.execute("DELETE FROM fee_structures WHERE structure_id = %s", (structure_id,))
            if not cur.rowcount:
                raise HTTPException(404, "Fee structure not found.")
            return {"message": "Fee structure deleted."}
        cur.execute("DELETE FROM fee_structure WHERE fee_id = %s", (structure_id,))
        if not cur.rowcount:
            raise HTTPException(404, "Fee structure not found.")
        return {"message": "Fee structure deleted."}


# ---------------------------------------------------------------------------
# PAYMENTS ENDPOINTS
# ---------------------------------------------------------------------------
@router.get("/fees/payments")
def get_fee_payments(class_name: Optional[str] = None, student_id: Optional[int] = None,
                     academic_year: Optional[str] = None,
                     limit: int = Query(1000, ge=1, le=5000), offset: int = Query(0, ge=0)):
    ay_start, ay_end = _parse_academic_year_range(academic_year)
    with db_cursor(dictionary=True) as (cur, _):
        rows = []
        if _table_exists(cur, "fee_transactions") and _table_exists(cur, "student_fee_invoices"):
            clauses, params = ["t.status='Completed'"], []
            if class_name:
                clauses.append("t.class_name=%s")
                params.append(clean_class(class_name))
            if student_id:
                clauses.append("t.student_id=%s")
                params.append(student_id)
            if academic_year:
                if ay_start and ay_end:
                    clauses.append("(i.academic_year=%s OR (t.payment_date >= %s AND t.payment_date <= %s))")
                    params.extend([academic_year, ay_start, ay_end])
                else:
                    clauses.append("i.academic_year=%s")
                    params.append(academic_year)
            sql = f"""SELECT t.transaction_id AS payment_id,t.receipt_number,t.student_id,t.student_name,
                             t.class_name,COALESCE(h.name,'Advance / Unallocated') AS fee_type,
                             i.period,t.amount AS amount_paid,t.payment_date,t.payment_mode,
                             'Paid' AS status,t.remarks,t.reference_number
                      FROM fee_transactions t
                      LEFT JOIN fee_allocations a ON a.transaction_id=t.transaction_id
                      LEFT JOIN student_fee_invoices i ON i.invoice_id=a.invoice_id
                      LEFT JOIN fee_heads h ON h.head_id=i.head_id
                      WHERE {' AND '.join(clauses)}
                      ORDER BY t.payment_date DESC,t.transaction_id DESC LIMIT %s OFFSET %s"""
            params.extend([limit, offset])
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

        # Legacy / standard fee_payments table support
        if _table_exists(cur, "fee_payments"):
            old_clauses, old_params = [], []
            if student_id:
                old_clauses.append("student_id=%s")
                old_params.append(student_id)
            if class_name:
                old_clauses.append("(class_name=%s OR class_name=%s)")
                old_params.extend([clean_class(class_name), class_name])
            if ay_start and ay_end:
                old_clauses.append("payment_date >= %s AND payment_date <= %s")
                old_params.extend([ay_start, ay_end])
            old_sql = """SELECT payment_id,student_id,student_name,class_name,fee_type,
                                amount_paid,payment_date,payment_mode,status,remarks
                         FROM fee_payments"""
            if old_clauses:
                old_sql += " WHERE " + " AND ".join(old_clauses)
            old_sql += " ORDER BY payment_date DESC,payment_id DESC LIMIT %s"
            old_params.append(limit)
            cur.execute(old_sql, tuple(old_params))
            for old in cur.fetchall():
                old["period"] = None
                rows.append(old)

        for r in rows:
            r["academic_year"] = academic_year_for(r.get("period"), r.get("payment_date"))

        if academic_year:
            rows = [r for r in rows if r.get("academic_year") == academic_year]

        return rows


@router.post("/fees/payments")
def record_fee_payment(data: FeePaymentIn):
    payment_date = data.payment_date or date.today()
    mode = data.payment_mode if data.payment_mode in PAYMENT_MODES else "Cash"
    period = data.period or ""
    if period and (len(period) != 7 or period[4] != "-"):
        raise HTTPException(400, "Period must use YYYY-MM format.")
    cls = clean_class(data.class_name)
    amount = Decimal(str(data.amount_paid)).quantize(Decimal("0.01"))

    with db_cursor(dictionary=True, autocommit=False) as (cur, conn):
        # If full v2 invoicing exists, use it
        if _table_exists(cur, "fee_transactions") and _table_exists(cur, "student_fee_invoices"):
            year = academic_year_for(period, payment_date)
            cur.execute("SELECT head_id,frequency FROM fee_heads WHERE head_id=%s AND is_active=1", (data.fee_head_id,))
            head = cur.fetchone()
            if not head:
                raise HTTPException(404, "Fee head not found.")
            cur.execute(
                """SELECT amount FROM fee_structures
                   WHERE class_name=%s AND head_id=%s AND academic_year=%s""",
                (cls, data.fee_head_id, year)
            )
            structure = cur.fetchone()
            due = Decimal(str(structure["amount"])) if structure else amount

            cur.execute(
                """INSERT INTO student_fee_invoices
                   (student_id,student_name,class_name,head_id,fee_type,academic_year,period,amount_due,due_date)
                   VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON DUPLICATE KEY UPDATE student_name=VALUES(student_name),class_name=VALUES(class_name)""",
                (data.student_id, data.student_name, cls, data.fee_head_id, data.fee_type, year, period, due, None)
            )
            cur.execute(
                """SELECT invoice_id FROM student_fee_invoices
                   WHERE student_id=%s AND head_id=%s AND academic_year=%s AND period=%s FOR UPDATE""",
                (data.student_id, data.fee_head_id, year, period)
            )
            invoice_id = cur.fetchone()["invoice_id"]
            cur.execute(
                """INSERT INTO fee_transactions
                   (student_id,student_name,class_name,amount,payment_date,payment_mode,reference_number,remarks)
                   VALUES(%s,%s,%s,%s,%s,%s,%s,%s)""",
                (data.student_id, data.student_name, cls, amount, payment_date, mode, None, data.remarks)
            )
            transaction_id = cur.lastrowid
            receipt = f"RC-{payment_date:%Y%m}-{transaction_id:08d}"
            cur.execute("UPDATE fee_transactions SET receipt_number=%s WHERE transaction_id=%s",
                        (receipt, transaction_id))
            cur.execute("INSERT INTO fee_allocations(transaction_id,invoice_id,amount) VALUES(%s,%s,%s)",
                        (transaction_id, invoice_id, amount))
            conn.commit()
            return {"message": "Payment recorded.", "payment_id": transaction_id, "receipt_number": receipt}

        # Otherwise fallback to fee_payments table
        cur.execute(
            """
            INSERT INTO fee_payments (
                student_id, student_name, class_name, fee_type, amount_paid,
                payment_date, payment_mode, status, remarks
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                data.student_id,
                data.student_name,
                cls,
                data.fee_type,
                amount,
                payment_date,
                mode,
                data.status or "Paid",
                data.remarks,
            )
        )
        payment_id = cur.lastrowid
        receipt = f"RC-{payment_date:%Y%m}-{payment_id:08d}"
        audit(cur, "RECEIVE_PAYMENT", "fee_payment", payment_id,
              {"receipt": receipt, "amount": str(amount), "student_id": data.student_id})
        conn.commit()
        return {
            "message": "Payment recorded.",
            "payment_id": payment_id,
            "transaction_id": payment_id,
            "receipt_number": receipt,
            "allocated_amount": str(amount),
            "advance_credit": "0.00"
        }


@router.delete("/fees/payments/{payment_id}")
def delete_fee_payment(payment_id: int):
    with db_cursor(database="school_management") as (cur, _):
        deleted = False
        if _table_exists(cur, "fee_transactions"):
            cur.execute("DELETE FROM fee_transactions WHERE transaction_id = %s", (payment_id,))
            if cur.rowcount > 0:
                deleted = True
        if _table_exists(cur, "fee_payments"):
            cur.execute("DELETE FROM fee_payments WHERE payment_id = %s", (payment_id,))
            if cur.rowcount > 0:
                deleted = True
        if not deleted:
            raise HTTPException(status_code=404, detail="Payment record not found")
        return {"message": "Payment record deleted successfully"}


@router.get("/fees/reports/summary")
def fee_summary(academic_year: Optional[str] = None):
    ay_start, ay_end = _parse_academic_year_range(academic_year)
    with db_cursor(dictionary=True) as (cur, _):
        if _table_exists(cur, "fee_transactions"):
            clauses = ["status='Completed'"]
            params = []
            if ay_start and ay_end:
                clauses.append("payment_date >= %s AND payment_date <= %s")
                params.extend([ay_start, ay_end])
            sql = f"SELECT COALESCE(SUM(amount),0) AS collected, COUNT(*) AS transactions FROM fee_transactions WHERE {' AND '.join(clauses)}"
            cur.execute(sql, tuple(params))
            col = cur.fetchone()
            return {**col, "outstanding": 0, "students_with_dues": 0}

        clauses_paid = ["status='Paid'"]
        clauses_due = ["status IN ('Pending', 'Partial')"]
        params_paid = []
        params_due = []
        if ay_start and ay_end:
            clauses_paid.append("payment_date >= %s AND payment_date <= %s")
            params_paid.extend([ay_start, ay_end])
            clauses_due.append("payment_date >= %s AND payment_date <= %s")
            params_due.extend([ay_start, ay_end])

        cur.execute(
            f"SELECT COALESCE(SUM(amount_paid),0) AS collected, COUNT(*) AS transactions FROM fee_payments WHERE {' AND '.join(clauses_paid)}",
            tuple(params_paid)
        )
        col = cur.fetchone()
        cur.execute(
            f"SELECT COALESCE(SUM(amount_paid),0) AS outstanding, COUNT(DISTINCT student_id) AS students_with_dues FROM fee_payments WHERE {' AND '.join(clauses_due)}",
            tuple(params_due)
        )
        dues = cur.fetchone()
        return {**col, **dues}


def _yearly_class_fees(cur, academic_year: str) -> dict:
    """Return the configured annual fee for one student in each class."""
    multipliers = {"monthly": 12, "quarterly": 4, "half_yearly": 2,
                   "yearly": 1, "one_time": 1}
    totals = {}
    if _table_exists(cur, "fee_structures") and _table_exists(cur, "fee_heads"):
        cur.execute("""SELECT fs.class_name, fs.amount, fh.frequency
                       FROM fee_structures fs JOIN fee_heads fh ON fh.head_id=fs.head_id
                       WHERE fs.academic_year=%s""", (academic_year,))
        rows = cur.fetchall()
    else:
        cur.execute("""SELECT class_name, fee_type, amount FROM fee_structure
                       WHERE academic_year=%s""", (academic_year,))
        structure_rows = cur.fetchall()
        heads = {h.get("name", "").lower(): h for h in _get_fallback_heads(cur)}
        rows = []
        for row in structure_rows:
            head = heads.get(str(row.get("fee_type") or "").lower(), {})
            rows.append({**row, "frequency": head.get("frequency", "yearly")})
    for row in rows:
        class_name = clean_class(row.get("class_name"))
        amount = float(row.get("amount") or 0)
        totals[class_name] = totals.get(class_name, 0) + amount * multipliers.get(row.get("frequency"), 1)
    return totals


def _paid_by_student(cur, academic_year: str, class_name: Optional[str] = None) -> dict:
    """Aggregate successful receipts once, using v2 allocations when available."""
    if all(_table_exists(cur, table) for table in ("fee_transactions", "fee_allocations", "student_fee_invoices")):
        clauses, params = ["i.academic_year=%s", "t.status='Completed'"], [academic_year]
        if class_name:
            clauses.append("(i.class_name=%s OR i.class_name=%s)")
            params.extend([clean_class(class_name), f"Class {clean_class(class_name)}"])
        cur.execute(f"""SELECT i.student_id, COALESCE(SUM(a.amount), 0) AS received
                         FROM fee_allocations a JOIN fee_transactions t ON t.transaction_id=a.transaction_id
                         JOIN student_fee_invoices i ON i.invoice_id=a.invoice_id
                         WHERE {' AND '.join(clauses)} GROUP BY i.student_id""", tuple(params))
        return {row["student_id"]: float(row["received"] or 0) for row in cur.fetchall()}

    start, end = _parse_academic_year_range(academic_year)
    clauses, params = ["status='Paid'", "payment_date >= %s", "payment_date <= %s"], [start, end]
    if class_name:
        clauses.append("(class_name=%s OR class_name=%s)")
        params.extend([clean_class(class_name), f"Class {clean_class(class_name)}"])
    cur.execute(f"""SELECT student_id, COALESCE(SUM(amount_paid), 0) AS received
                     FROM fee_payments WHERE {' AND '.join(clauses)} GROUP BY student_id""", tuple(params))
    return {row["student_id"]: float(row["received"] or 0) for row in cur.fetchall()}


@router.get("/fees/payment-record/classes")
def get_class_payment_summary(academic_year: str = Query(...)):
    """Class cards with annual expected fee, receipts, and remaining balance."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute("""SELECT sd.student_id, spd.class AS class_name
                           FROM student_details sd JOIN student_personal_details spd
                           ON spd.student_id=sd.student_id WHERE spd.class IS NOT NULL""")
            students = cur.fetchall()
            yearly_fees = _yearly_class_fees(cur, academic_year)
            received = _paid_by_student(cur, academic_year)
            result = {}
            for student in students:
                cls = clean_class(student["class_name"])
                # A class belongs in Payment Records only after its fee
                # structure has been configured for this academic year.
                if cls not in yearly_fees:
                    continue
                item = result.setdefault(cls, {"class_name": cls, "total_students": 0,
                                               "payment_to_receive": 0.0, "received": 0.0})
                item["total_students"] += 1
                item["payment_to_receive"] += yearly_fees.get(cls, 0)
                item["received"] += received.get(student["student_id"], 0)
            for item in result.values():
                item["remaining"] = max(item["payment_to_receive"] - item["received"], 0)
            order = {"KIDSCARE": 0, "NUR": 1, "LKG": 2, "UKG": 3}
            return sorted(result.values(), key=lambda row: (order.get(row["class_name"].upper(), 4), row["class_name"]))
    except Exception:
        logger.exception("Unable to fetch class payment summary")
        raise HTTPException(500, "Unable to fetch class payment summary")


@router.get("/fees/payment-record/students")
def get_class_payment_students(class_name: str = Query(...), academic_year: str = Query(...)):
    """Students in one class, with their class fee and receipts for the selected year."""
    try:
        cls = clean_class(class_name)
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute("""SELECT sd.student_id, sd.full_name, spd.section, spd.admission_no
                           FROM student_details sd JOIN student_personal_details spd
                           ON spd.student_id=sd.student_id
                           WHERE spd.class=%s OR spd.class=%s ORDER BY sd.full_name""", (cls, f"Class {cls}"))
            students = cur.fetchall()
            total_fee = _yearly_class_fees(cur, academic_year).get(cls, 0)
            received = _paid_by_student(cur, academic_year, cls)
            for student in students:
                paid = received.get(student["student_id"], 0)
                student.update(total_fee=total_fee, amount_received=paid,
                               remaining=max(total_fee - paid, 0),
                               status="Paid" if total_fee and paid >= total_fee else ("Partial" if paid else "Not Paid"))
            return students
    except Exception:
        logger.exception("Unable to fetch student payment details")
        raise HTTPException(500, "Unable to fetch student payment details")


@router.get("/fees/payment-record/student-details")
def get_student_fee_details(student_id: int = Query(...), academic_year: str = Query(...)):
    """Fee-head breakdown and successful receipt history for one student."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute("""SELECT sd.full_name, spd.class AS class_name FROM student_details sd
                           JOIN student_personal_details spd ON spd.student_id=sd.student_id
                           WHERE sd.student_id=%s""", (student_id,))
            student = cur.fetchone()
            if not student:
                raise HTTPException(404, "Student not found")
            cls = clean_class(student["class_name"])
            if _table_exists(cur, "fee_structures") and _table_exists(cur, "fee_heads"):
                cur.execute("""SELECT fh.name, fh.frequency, fs.amount AS amount_due FROM fee_structures fs
                               JOIN fee_heads fh ON fh.head_id=fs.head_id
                               WHERE fs.class_name=%s AND fs.academic_year=%s ORDER BY fh.name""", (cls, academic_year))
            else:
                cur.execute("""SELECT fee_type AS name, amount AS amount_due FROM fee_structure
                               WHERE (class_name=%s OR class_name=%s) AND academic_year=%s ORDER BY fee_type""",
                            (cls, f"Class {cls}", academic_year))
            heads = cur.fetchall()
            multipliers = {"monthly": 12, "quarterly": 4, "half_yearly": 2, "yearly": 1, "one_time": 1}
            if heads and "frequency" not in heads[0]:
                configured_heads = {h.get("name", "").lower(): h for h in _get_fallback_heads(cur)}
                for head in heads:
                    head["frequency"] = configured_heads.get(head["name"].lower(), {}).get("frequency", "yearly")
            for head in heads:
                head["amount_due"] = float(head["amount_due"] or 0) * multipliers.get(head.get("frequency"), 1)
            paid = _paid_by_student(cur, academic_year, cls).get(student_id, 0)
            for head in heads:
                head["paid"] = 0.0
            # Allocation details are exact by fee head in the v2 ledger.
            if all(_table_exists(cur, table) for table in ("fee_transactions", "fee_allocations", "student_fee_invoices")):
                cur.execute("""SELECT h.name, COALESCE(SUM(a.amount),0) AS paid FROM fee_allocations a
                               JOIN fee_transactions t ON t.transaction_id=a.transaction_id
                               JOIN student_fee_invoices i ON i.invoice_id=a.invoice_id
                               JOIN fee_heads h ON h.head_id=i.head_id
                               WHERE i.student_id=%s AND i.academic_year=%s AND t.status='Completed' GROUP BY h.name""",
                            (student_id, academic_year))
                paid_by_head = {row["name"]: float(row["paid"] or 0) for row in cur.fetchall()}
                for head in heads:
                    head["paid"] = paid_by_head.get(head["name"], 0.0)
                cur.execute("""SELECT t.payment_date, t.amount, t.payment_mode FROM fee_transactions t
                               JOIN fee_allocations a ON a.transaction_id=t.transaction_id
                               JOIN student_fee_invoices i ON i.invoice_id=a.invoice_id
                               WHERE i.student_id=%s AND i.academic_year=%s AND t.status='Completed'
                               GROUP BY t.transaction_id ORDER BY t.payment_date DESC""", (student_id, academic_year))
            else:
                if heads and paid:
                    heads[0]["paid"] = paid
                start, end = _parse_academic_year_range(academic_year)
                cur.execute("""SELECT payment_date, amount_paid AS amount, payment_mode FROM fee_payments
                               WHERE student_id=%s AND status='Paid' AND payment_date >= %s AND payment_date <= %s
                               ORDER BY payment_date DESC""", (student_id, start, end))
            return {"student_name": student["full_name"], "fee_heads": heads, "payments": cur.fetchall()}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unable to fetch student fee details")
        raise HTTPException(500, "Unable to fetch student fee details")
