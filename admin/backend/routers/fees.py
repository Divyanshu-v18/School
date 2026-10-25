"""
Fee structures and payments router.
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException

from database import db_cursor
from models.fee import FeeStructure, FeePayment

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Fees"])


@router.get("/fees/structures")
def get_fee_structures(class_name: Optional[str] = None):
    """Retrieve fee structures, optionally filtered by class."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            if class_name:
                cur.execute(
                    "SELECT * FROM fee_structure WHERE class_name = %s ORDER BY fee_id",
                    (class_name,),
                )
            else:
                cur.execute("SELECT * FROM fee_structure ORDER BY fee_id")
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/fees/structures")
def add_fee_structure(structure: FeeStructure):
    """Create a new fee structure record."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO fee_structure (class_name, fee_type, amount, academic_year, due_date)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    structure.class_name,
                    structure.fee_type,
                    structure.amount,
                    structure.academic_year,
                    structure.due_date,
                ),
            )
            return {"message": "Fee structure added successfully", "fee_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/fees/structures/{fee_id}")
def delete_fee_structure(fee_id: int):
    """Delete a fee structure by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM fee_structure WHERE fee_id = %s", (fee_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Fee structure not found")
            return {"message": "Fee structure deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.get("/fees/payments")
def get_fee_payments(class_name: Optional[str] = None):
    """Retrieve fee payment records, optionally filtered by class."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            if class_name:
                cur.execute(
                    "SELECT * FROM fee_payments WHERE class_name = %s ORDER BY payment_id DESC",
                    (class_name,),
                )
            else:
                cur.execute("SELECT * FROM fee_payments ORDER BY payment_id DESC")
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/fees/payments")
def add_fee_payment(payment: FeePayment):
    """Record a fee payment."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO fee_payments (
                    student_id, student_name, class_name, fee_type, amount_paid,
                    payment_date, payment_mode, status, remarks
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    payment.student_id,
                    payment.student_name,
                    payment.class_name,
                    payment.fee_type,
                    payment.amount_paid,
                    payment.payment_date,
                    payment.payment_mode,
                    payment.status,
                    payment.remarks,
                ),
            )
            return {"message": "Fee payment recorded successfully", "payment_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/fees/payments/{payment_id}")
def delete_fee_payment(payment_id: int):
    """Delete a fee payment record by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM fee_payments WHERE payment_id = %s", (payment_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Payment record not found")
            return {"message": "Payment record deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
