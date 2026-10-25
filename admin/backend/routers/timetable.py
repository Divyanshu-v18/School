"""
Class timetable management router.
"""

import logging
from fastapi import APIRouter, HTTPException

from database import db_cursor
from models.timetable import Timetable

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Timetable"])


@router.get("/timetable")
def get_timetable(class_name: str = "10", section: str = "A"):
    """Retrieve schedule timetable for a class and section."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute(
                """
                SELECT * FROM timetable
                WHERE class_name = %s AND section = %s
                ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), period_number
                """,
                (class_name, section),
            )
            slots = cur.fetchall()
            for s in slots:
                if hasattr(s.get("start_time"), "total_seconds"):
                    total_secs = int(s["start_time"].total_seconds())
                    s["start_time"] = f"{total_secs//3600:02d}:{(total_secs%3600)//60:02d}"
                elif s.get("start_time"):
                    s["start_time"] = str(s["start_time"])

                if hasattr(s.get("end_time"), "total_seconds"):
                    total_secs = int(s["end_time"].total_seconds())
                    s["end_time"] = f"{total_secs//3600:02d}:{(total_secs%3600)//60:02d}"
                elif s.get("end_time"):
                    s["end_time"] = str(s["end_time"])
            return slots
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/timetable")
def add_timetable_slot(slot: Timetable):
    """Add or update a timetable slot."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO timetable (
                    class_name, section, day_of_week, period_number,
                    subject, teacher_name, start_time, end_time
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    subject = VALUES(subject),
                    teacher_name = VALUES(teacher_name),
                    start_time = VALUES(start_time),
                    end_time = VALUES(end_time)
                """,
                (
                    slot.class_name,
                    slot.section,
                    slot.day_of_week,
                    slot.period_number,
                    slot.subject,
                    slot.teacher_name,
                    slot.start_time,
                    slot.end_time,
                ),
            )
            return {"message": "Timetable slot saved successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/timetable/{timetable_id}")
def delete_timetable_slot(timetable_id: int):
    """Delete a timetable slot by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM timetable WHERE timetable_id = %s", (timetable_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Timetable slot not found")
            return {"message": "Timetable slot deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
