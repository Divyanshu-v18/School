"""
School administration settings router.
"""

import logging
from fastapi import APIRouter, HTTPException
from database import db_cursor
from models.safe import validate_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Settings"])


@router.get("/settings")
def get_settings():
    """Retrieve all school settings as key-value pairs."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute("SELECT setting_key, setting_value FROM school_settings")
            rows = cur.fetchall()
            return {r["setting_key"]: r["setting_value"] for r in rows}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )



@router.post("/settings")
def save_settings(settings: dict):
    """Save or update key-value school settings."""

    # Only validation errors should return HTTP 422.
    try:
        cleaned_settings = validate_settings(settings)
    except ValueError as val_err:
        raise HTTPException(
            status_code=422,
            detail=str(val_err),
        ) from val_err

    # Errors occurring after validation are handled as server errors.
    try:
        with db_cursor(database="school_management") as (cur, _):
            for k, v in cleaned_settings.items():
                cur.execute(
                    """
                    INSERT INTO school_settings (setting_key, setting_value)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
                    """,
                    (k, v),
                )

        return {"message": "Settings saved successfully"}

    except HTTPException:
        raise

    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )
