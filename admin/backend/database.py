
"""
Database connection and session management for School Management System.
Database credentials must be supplied through environment variables or .env.
"""

import logging
import os
from contextlib import contextmanager
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load local development environment variables from .env
_ENV_FILE = Path(__file__).resolve().parent / ".env"
if _ENV_FILE.is_file():
    load_dotenv(dotenv_path=_ENV_FILE)
else:
    load_dotenv()

# Required database configuration: no hardcoded credential defaults
_REQUIRED_VARS = ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME")
_missing = [
    name for name in _REQUIRED_VARS
    if not os.getenv(name, "").strip()
]

if _missing:
    raise RuntimeError(
        "Missing required database environment variables: "
        + ", ".join(_missing)
    )

DB_HOST = os.environ["DB_HOST"]
try:
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
except ValueError as exc:
    raise RuntimeError("DB_PORT must be a valid integer.") from exc

if not 1 <= DB_PORT <= 65535:
    raise RuntimeError("DB_PORT must be between 1 and 65535.")
DB_USER = os.environ["DB_USER"]
DB_PASSWORD = os.environ["DB_PASSWORD"]
DB_NAME = os.environ["DB_NAME"]


def _create_connection(database_name: str = DB_NAME):
    """Create a MySQL connection using the configured credentials."""
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=database_name,
    )


def get_db_connection():
    """Return a connection to the consolidated database."""
    return _create_connection(DB_NAME)


def get_connection_by_name(database_name: str = DB_NAME):
    """Return the sole application database connection.

    The argument remains temporarily for test compatibility, but only the
    configured consolidated database is accepted.
    """
    if database_name != DB_NAME:
        raise ValueError("Only the configured consolidated database is supported.")
    return _create_connection(DB_NAME)



@contextmanager
def db_cursor(
    database: str = DB_NAME,
    dictionary: bool = False,
    autocommit: bool = True,
):
    """
    Yield (cursor, connection).
    Commit on success when autocommit is enabled, roll back on error,
    and always close resources that were successfully created.
    """
    connection = None
    cursor = None

    try:
        connection = get_connection_by_name(database)
        cursor = connection.cursor(dictionary=dictionary)

        yield cursor, connection

        if autocommit:
            connection.commit()

    except Exception:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                logger.warning(
                    "Database rollback failed during exception handling",
                    exc_info=True,
                )
        raise

    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                logger.warning(
                    "Failed to close cursor during cleanup",
                    exc_info=True,
                )

        if connection is not None:
            try:
                connection.close()
            except Exception:
                logger.warning(
                    "Failed to close connection during cleanup",
                    exc_info=True,
                )
