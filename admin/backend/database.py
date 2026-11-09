
"""
Database connection and session management for School Management System.
Database credentials must be supplied through environment variables or .env.
"""

import logging
import os
import threading
import time
from contextlib import contextmanager
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

from mysql.connector import pooling

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

def _resolve_ssl_ca() -> str:
    """Find a usable CA bundle: env var, then certifi, then system paths."""
    explicit = os.getenv("DB_SSL_CA", "").strip()
    if explicit and os.path.isfile(explicit):
        return explicit

    try:
        import certifi
        return certifi.where()
    except ImportError:
        pass

    for path in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"):
        if os.path.isfile(path):
            return path

    raise RuntimeError(
        "No CA certificate bundle found. Set DB_SSL_CA to a valid file path."
    )


_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

# TLS is skipped ONLY when the database is on this same machine.
USE_SSL = DB_HOST.strip().lower() not in _LOCAL_HOSTS

if not USE_SSL and os.getenv("RENDER"):
    # Render sets RENDER automatically. Never run production without TLS.
    raise RuntimeError("Refusing to start: TLS is required for a hosted deployment.")

if not USE_SSL:
    logger.warning("Database TLS is OFF because DB_HOST is local. Development only.")

DB_SSL_CA = _resolve_ssl_ca() if USE_SSL else None

_POOL = None
_POOL_LOCK = threading.Lock()


def _get_pool():
    """Create the connection pool once, safely across threads."""
    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                config = {
                    "pool_name": "school_pool",
                    "pool_size": 10,
                    "pool_reset_session": True,
                    "host": DB_HOST,
                    "port": DB_PORT,
                    "user": DB_USER,
                    "password": DB_PASSWORD,
                    "database": DB_NAME,
                }
                if USE_SSL:
                    config.update(
                        ssl_ca=DB_SSL_CA,
                        ssl_verify_cert=True,
                        ssl_verify_identity=True,
                    )
                _POOL = pooling.MySQLConnectionPool(**config)
    return _POOL


def _create_connection(database_name: str = DB_NAME):
    """Borrow a connection from the pool (TLS-verified unless the DB is local)."""
    pool = _get_pool()
    deadline = time.monotonic() + 10

    while True:
        try:
            conn = pool.get_connection()
            break
        except pooling.PoolError:
            # All connections are busy; wait briefly instead of failing.
            if time.monotonic() > deadline:
                raise
            time.sleep(0.05)

    conn.ping(reconnect=True, attempts=2, delay=0)  # revive if the server dropped it
    return conn




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
