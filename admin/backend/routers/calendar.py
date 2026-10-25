"""
Academic calendar events management router.
"""

import logging
from fastapi import APIRouter, HTTPException

from database import db_cursor
from models.calendar_event import CalendarEvent

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Calendar"])


@router.get("/calendar/events")
def get_calendar_events():
    """Retrieve all academic calendar events ordered by event date."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute("SELECT * FROM calendar_events ORDER BY event_date ASC")
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/calendar/events")
def add_calendar_event(event: CalendarEvent):
    """Add a new calendar event."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO calendar_events (title, description, event_date, end_date, event_type)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (event.title, event.description, event.event_date, event.end_date, event.event_type),
            )
            return {"message": "Calendar event added successfully", "event_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/calendar/events/{event_id}")
def delete_calendar_event(event_id: int):
    """Delete a calendar event by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM calendar_events WHERE event_id = %s", (event_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Calendar event not found")
            return {"message": "Calendar event deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
