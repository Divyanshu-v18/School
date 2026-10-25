"""
Subjects management router.
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException

from database import db_cursor
from models.subject import Subject

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Subjects"])


@router.get("/subjects")
def get_subjects(class_name: Optional[str] = None):
    """Retrieve subjects, optionally filtered by class."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            if class_name:
                cur.execute(
                    "SELECT * FROM subjects WHERE class_name = %s ORDER BY subject_id",
                    (class_name,),
                )
            else:
                cur.execute("SELECT * FROM subjects ORDER BY subject_id")
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/subjects")
def add_subject(subject: Subject):
    """Add a new subject."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO subjects (subject_name, subject_code, class_name, description)
                VALUES (%s, %s, %s, %s)
                """,
                (subject.subject_name, subject.subject_code, subject.class_name, subject.description),
            )
            return {"message": "Subject added successfully", "subject_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/subjects/{subject_id}")
def delete_subject(subject_id: int):
    """Delete a subject by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM subjects WHERE subject_id = %s", (subject_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Subject not found")
            return {"message": "Subject deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
