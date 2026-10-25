"""
Dashboard statistics router.
Provides aggregated stats for students, teachers, classes, attendance, fees, exams, and notices.
"""

import logging
from datetime import date

from fastapi import APIRouter, HTTPException

from database import db_cursor

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Dashboard"])


def _build_attendance_stats(att_rows):
    """Return counts for supported attendance statuses only."""
    attendance_stats = {"Present": 0, "Absent": 0, "Late": 0}

    for row in att_rows:
        status = row.get("status")

        if status not in attendance_stats:
            logger.warning(
                "Unexpected attendance status %r in dashboard data; ignoring it",
                status,
            )
            continue

        attendance_stats[status] = row["count"]

    return attendance_stats


@router.get("/admin/dashboard-stats")
def get_dashboard_stats():
    """Retrieve aggregated counts, metrics, and recent activity for the dashboard."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur_s, _):
            cur_s.execute(
                "SELECT COUNT(*) AS total_students FROM student_details"
            )
            total_students = cur_s.fetchone()["total_students"]

            cur_s.execute(
                "SELECT COUNT(DISTINCT class) AS total_classes "
                "FROM student_personal_details"
            )
            total_classes = cur_s.fetchone()["total_classes"]

        with db_cursor(database="school_management", dictionary=True) as (cur_t, _):
            cur_t.execute(
                "SELECT COUNT(*) AS total_teachers FROM teacher_details"
            )
            total_teachers = cur_t.fetchone()["total_teachers"]

        today = date.today()

        with db_cursor(database="school_management", dictionary=True) as (cur_a, _):
            cur_a.execute(
                "SELECT status, COUNT(*) AS count "
                "FROM attendance WHERE date = %s GROUP BY status",
                (today,),
            )
            att_rows = cur_a.fetchall()
            attendance_stats = _build_attendance_stats(att_rows)

            cur_a.execute(
                "SELECT COUNT(*) AS active_notices "
                "FROM notices WHERE is_active = TRUE"
            )
            active_notices = cur_a.fetchone()["active_notices"]

            cur_a.execute(
                "SELECT COUNT(*) AS upcoming_exams "
                "FROM exams WHERE exam_date >= %s",
                (today,),
            )
            upcoming_exams = cur_a.fetchone()["upcoming_exams"]

            cur_a.execute(
                "SELECT COALESCE(SUM(amount_paid), 0) AS total_fees_collected "
                "FROM fee_payments"
            )
            total_fees = cur_a.fetchone()["total_fees_collected"]

            cur_a.execute(
                "SELECT * FROM notices "
                "WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 5"
            )
            recent_notices = cur_a.fetchall()

            cur_a.execute(
                "SELECT * FROM calendar_events "
                "WHERE event_date >= %s ORDER BY event_date ASC LIMIT 5",
                (today,),
            )
            upcoming_events = cur_a.fetchall()

        return {
            "total_students": total_students,
            "total_teachers": total_teachers,
            "total_classes": total_classes,
            "attendance_today": attendance_stats,
            "active_notices": active_notices,
            "upcoming_exams": upcoming_exams,
            "total_fees_collected": float(total_fees),
            "recent_notices": recent_notices,
            "upcoming_events": upcoming_events,
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )
