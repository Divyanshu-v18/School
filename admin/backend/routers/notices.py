"""
Notices and announcements management router.
"""

import logging
from fastapi import APIRouter, HTTPException

from database import db_cursor
from models.notice import Notice

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Notices"])


@router.get("/notices")
def get_notices(active_only: bool = False):
    """Retrieve notices, optionally filtered by active status only."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            if active_only:
                cur.execute("SELECT * FROM notices WHERE is_active = TRUE ORDER BY created_at DESC")
            else:
                cur.execute("SELECT * FROM notices ORDER BY created_at DESC")
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/notices")
def add_notice(notice: Notice):
    """Publish a new notice."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO notices (title, content, category, is_active)
                VALUES (%s, %s, %s, %s)
                """,
                (notice.title, notice.content, notice.category, notice.is_active),
            )
            return {"message": "Notice published successfully", "notice_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/notices/{notice_id}")
def delete_notice(notice_id: int):
    """Delete a notice by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM notices WHERE notice_id = %s", (notice_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Notice not found")
            return {"message": "Notice deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
