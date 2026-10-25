"""
Attendance management router for students and teachers.
"""

import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, HTTPException

from database import db_cursor
from models.attendance import Attendance, TeacherAttendance

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Attendance"])


@router.get("/attendance")
def get_attendance(
    date_val: Optional[date] = None,
    class_name: Optional[str] = None,
    section: Optional[str] = None,
):
    """Retrieve student attendance filtered by date, class, and section."""
    query_date = date_val or date.today()
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            conditions = ["date = %s"]
            params = [query_date]
            if class_name:
                conditions.append("class_name = %s")
                params.append(class_name)
            if section:
                conditions.append("section = %s")
                params.append(section)
            sql = f"SELECT * FROM attendance WHERE {' AND '.join(conditions)} ORDER BY student_name"
            cur.execute(sql, tuple(params))
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/attendance")
def save_attendance(records: List[Attendance]):
    """Save or update attendance for a list of students."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            for r in records:
                cur.execute(
                    """
                    INSERT INTO attendance (student_id, student_name, class_name, section, date, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE status = VALUES(status)
                    """,
                    (r.student_id, r.student_name, r.class_name, r.section, r.date, r.status),
                )
            return {"message": f"Recorded attendance for {len(records)} students"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.get("/teacher-attendance")
def get_teacher_attendance(date_val: Optional[date] = None):
    """Retrieve teacher attendance for a given date."""
    query_date = date_val or date.today()
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute(
                "SELECT * FROM teacher_attendance WHERE date = %s ORDER BY teacher_name",
                (query_date,),
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


@router.post("/teacher-attendance")
def save_teacher_attendance(records: List[TeacherAttendance]):
    """Save or update attendance for a list of teachers."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            for r in records:
                cur.execute(
                    """
                    INSERT INTO teacher_attendance (teacher_id, teacher_name, post, date, status, time_in, time_out)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        time_in = VALUES(time_in),
                        time_out = VALUES(time_out)
                    """,
                    (r.teacher_id, r.teacher_name, r.post, r.date, r.status, r.time_in, r.time_out),
                )
            return {"message": f"Recorded attendance for {len(records)} teachers"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
