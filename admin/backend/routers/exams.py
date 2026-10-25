"""
Exams and exam results management router.
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException

from database import db_cursor
from models.exam import Exam, ExamResult

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Exams"])


@router.get("/exams")
def get_exams(class_name: Optional[str] = None):
    """Retrieve exams, optionally filtered by class name."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            if class_name:
                cur.execute(
                    "SELECT * FROM exams WHERE class_name = %s ORDER BY exam_date ASC",
                    (class_name,),
                )
            else:
                cur.execute("SELECT * FROM exams ORDER BY exam_date ASC")
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/exams")
def add_exam(exam: Exam):
    """Schedule a new examination."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO exams (exam_name, class_name, subject, exam_date, max_marks)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (exam.exam_name, exam.class_name, exam.subject, exam.exam_date, exam.max_marks),
            )
            return {"message": "Exam scheduled successfully", "exam_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/exams/{exam_id}")
def delete_exam(exam_id: int):
    """Delete an exam by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM exams WHERE exam_id = %s", (exam_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Exam not found")
            return {"message": "Exam deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.get("/exams/{exam_id}/results")
def get_exam_results(exam_id: int):
    """Retrieve all student results for a specific exam."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute(
                "SELECT * FROM exam_results WHERE exam_id = %s ORDER BY marks_obtained DESC",
                (exam_id,),
            )
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/exams/{exam_id}/results")
def add_exam_result(exam_id: int, result: ExamResult):
    """Record an exam result for a student."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO exam_results (exam_id, student_id, student_name, marks_obtained, grade)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (exam_id, result.student_id, result.student_name, result.marks_obtained, result.grade),
            )
            return {"message": "Exam result added successfully", "result_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
