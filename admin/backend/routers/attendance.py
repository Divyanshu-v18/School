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
    student_id: Optional[int] = None,
):
    """Retrieve attendance filtered by date, class, section, or student."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            conditions = []
            params = []

            if student_id:
                conditions.append("student_id = %s")
                params.append(student_id)

            if date_val:
                conditions.append("date = %s")
                params.append(date_val)

            if class_name:
                conditions.append("class_name = %s")
                params.append(class_name)

            if section:
                conditions.append("section = %s")
                params.append(section)

            sql = "SELECT * FROM attendance"

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY date DESC"

            cur.execute(sql, tuple(params))
            return cur.fetchall()

    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )

MAX_RECORDS_PER_REQUEST = 1000


@router.post("/attendance")
def save_attendance(records: List[Attendance]):
    """Save or update attendance for a list of students."""
    if len(records) > MAX_RECORDS_PER_REQUEST:
        raise HTTPException(status_code=400, detail="Too many records in one request.")
    try:
        with db_cursor(database="school_management", autocommit=False) as (cur, conn):
            for r in records:
                cur.execute(
                    """
                    INSERT INTO attendance (student_id, student_name, class_name, section, date, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE status = VALUES(status)
                    """,
                    (r.student_id, r.student_name, r.class_name, r.section, r.date, r.status),
                )
            conn.commit()  # all-or-nothing: either every record is saved or none
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
def get_teacher_attendance(
    date_val: Optional[date] = None,
    teacher_id: Optional[int] = None,
):
    """Retrieve teacher attendance filtered by date or teacher."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            conditions = []
            params = []

            if teacher_id is not None:
                conditions.append("teacher_id = %s")
                params.append(teacher_id)

            if date_val is not None:
                conditions.append("date = %s")
                params.append(date_val)
            elif teacher_id is None:
                # Default to today's date when no teacher_id is specified
                conditions.append("date = %s")
                params.append(date.today())

            sql = "SELECT * FROM teacher_attendance"
            if conditions:
                sql += " WHERE " + " AND ".join(conditions)
            sql += " ORDER BY date DESC, teacher_name"

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


@router.post("/teacher-attendance")
def save_teacher_attendance(records: List[TeacherAttendance]):
    """Save or update attendance for a list of teachers."""
    if len(records) > MAX_RECORDS_PER_REQUEST:
        raise HTTPException(status_code=400, detail="Too many records in one request.")
    try:
        with db_cursor(database="school_management", autocommit=False) as (cur, conn):
            for r in records:
                # time_in / time_out are optional: an existing record keeps its stored
                # times when none are sent, and a new record gets the default 09:00 / 16:00.
                cur.execute(
                    """
                    INSERT INTO teacher_attendance (teacher_id, teacher_name, post, date, status, time_in, time_out)
                    VALUES (%s, %s, %s, %s, %s, COALESCE(%s, '09:00'), COALESCE(%s, '16:00'))
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        time_in = COALESCE(%s, time_in),
                        time_out = COALESCE(%s, time_out)
                    """,
                    (r.teacher_id, r.teacher_name, r.post, r.date, r.status,
                     r.time_in, r.time_out, r.time_in, r.time_out),
                )
            conn.commit()
            return {"message": f"Recorded attendance for {len(records)} teachers"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )