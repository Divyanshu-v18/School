"""Authentication, database-backed sessions, and account management."""
import base64
import hashlib
import logging
import os
from pathlib import Path
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Header, HTTPException, Request, Response
import mysql.connector
from pydantic import BaseModel, Field

from database import db_cursor
from rbac import ROLES
from models.safe import SafeFormModel

logger = logging.getLogger(__name__)

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
if _ENV_FILE.is_file():
    load_dotenv(dotenv_path=_ENV_FILE)
else:
    load_dotenv()

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
SESSION_EXPIRATION_SECONDS = 8 * 60 * 60
SESSION_COOKIE_NAME = "abc_school_session"


def _get_boolean_env(name: str, default: bool) -> bool:
    """Read a strictly validated boolean environment setting."""
    raw_value = os.getenv(name, str(default)).strip().lower()
    if raw_value in {"1", "true", "yes", "on"}:
        return True
    if raw_value in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be a boolean value.")


# HTTPS deployments must retain the secure-cookie default. Local HTTP
# development must opt in explicitly with SESSION_COOKIE_SECURE=false.
SESSION_COOKIE_SECURE = _get_boolean_env("SESSION_COOKIE_SECURE", True)
SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "lax").strip().lower()
if SESSION_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise RuntimeError("SESSION_COOKIE_SAMESITE must be lax, strict, or none.")
if SESSION_COOKIE_SAMESITE == "none" and not SESSION_COOKIE_SECURE:
    raise RuntimeError("SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true.")

LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_SECONDS = 5, 15 * 60
LOGIN_ATTEMPTS = defaultdict(deque)
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_USERNAME and ADMIN_PASSWORD must be configured")

class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=512)
    role: Optional[str] = None

class UserCreate(SafeFormModel):
    username: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=12, max_length=512)
    role: str
    display_name: str = Field(min_length=1, max_length=100)

def _token_hash(token: str) -> str: return hashlib.sha256(token.encode()).hexdigest()

def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return "scrypt$" + base64.b64encode(salt + hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)).decode()

def _verify_password(password: str, encoded: str) -> bool:
    try:
        kind, payload = encoded.split("$", 1); raw = base64.b64decode(payload)
        return kind == "scrypt" and len(raw) == 80 and secrets.compare_digest(hashlib.scrypt(password.encode(), salt=raw[:16], n=2**14, r=8, p=1), raw[16:])
    except (ValueError, TypeError): return False

def _get_token(authorization: Optional[str]) -> Optional[str]:
    scheme, _, value = (authorization or "").partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None

def _db_user(username: str):
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute("SELECT user_id, username, password_hash, role, display_name, is_active FROM app_users WHERE username=%s", (username,))
            return cur.fetchone()
    except Exception as exc:
        logger.exception("Database error while retrieving user account")
        raise HTTPException(503, "Authentication service is temporarily unavailable.") from exc

def _create_db_session(user: dict, token: str) -> None:
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM app_sessions WHERE expires_at <= UTC_TIMESTAMP()")
            cur.execute("INSERT INTO app_sessions (user_id, token_hash, expires_at) VALUES (%s,%s,%s)", (user["user_id"], _token_hash(token), datetime.utcnow() + timedelta(seconds=SESSION_EXPIRATION_SECONDS)))
    except Exception as exc:
        logger.exception("Database error while creating user session")
        raise HTTPException(503, "Authentication service is temporarily unavailable.") from exc

def provision_configured_admin() -> None:
    """Create the configured bootstrap admin once, without modifying an existing account."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("SELECT user_id FROM app_users WHERE username=%s", (ADMIN_USERNAME,))
            if cur.fetchone() is None:
                cur.execute(
                    "INSERT INTO app_users (username,password_hash,role,display_name) VALUES (%s,%s,'admin','Administrator')",
                    (ADMIN_USERNAME, _hash_password(ADMIN_PASSWORD)),
                )
    except Exception as exc:
        logger.exception("Database error while provisioning default admin")
        raise RuntimeError("Unable to provision the required database-backed administrator account.") from exc

def get_authenticated_user(
    authorization: Optional[str] = None,
    session_cookie: Optional[str] = None,
) -> dict:
    """Resolve a user from a cookie session or a legacy bearer client token."""
    token = session_cookie.strip() if session_cookie and session_cookie.strip() else _get_token(authorization)
    if not token: raise HTTPException(401, "Authentication required.", {"WWW-Authenticate": "Bearer"})
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute("SELECT u.user_id,u.username,u.role,u.display_name FROM app_sessions s JOIN app_users u ON u.user_id=s.user_id WHERE s.token_hash=%s AND s.expires_at>UTC_TIMESTAMP() AND u.is_active=TRUE", (_token_hash(token),))
            account = cur.fetchone()
        if account:
            return {"id": account["user_id"], "username": account["username"], "role": account["role"], "name": account["display_name"], "avatar": account["display_name"][:2].upper()}
    except Exception as exc:
        logger.exception("Database error while verifying session")
        raise HTTPException(503, "Authentication service is temporarily unavailable.") from exc
    raise HTTPException(401, "Invalid or expired session.", {"WWW-Authenticate": "Bearer"})

def require_admin_session(request: Request, authorization: Optional[str] = Header(None)):
    user = get_authenticated_user(
        authorization,
        request.cookies.get(SESSION_COOKIE_NAME),
    )
    if user["role"] != "admin": raise HTTPException(403, "Administrator access required.")
    return user

@router.post("/login")
def login(req: LoginRequest, request: Request, response: Response):
    ip, now = (request.client.host if request.client else "unknown"), time.time(); attempts = LOGIN_ATTEMPTS[ip]
    while attempts and now - attempts[0] >= LOGIN_RATE_WINDOW_SECONDS: attempts.popleft()
    if len(attempts) >= LOGIN_RATE_LIMIT: raise HTTPException(429, "Too many failed login attempts. Try again later.")
    username = req.username.strip().lower(); account = _db_user(username)
    valid = bool(account and account["is_active"] and _verify_password(req.password, account["password_hash"]))
    if not valid: attempts.append(now); raise HTTPException(401, "Invalid username or password.")
    if req.role and req.role.lower() != account["role"]: attempts.append(now); raise HTTPException(403, "This account does not have the selected role.")
    LOGIN_ATTEMPTS.pop(ip, None); token = "session_" + secrets.token_urlsafe(32)
    user = {"id": account["user_id"], "username": account["username"], "role": account["role"], "name": account["display_name"], "avatar": account["display_name"][:2].upper()}
    _create_db_session(account, token)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_EXPIRATION_SECONDS,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )
    # The raw token is intentionally never exposed to browser JavaScript.
    return {"success": True, "user": user, "expires_in": SESSION_EXPIRATION_SECONDS}

@router.post("/logout")
def logout(request: Request, response: Response, authorization: Optional[str] = Header(None)):
    token = request.cookies.get(SESSION_COOKIE_NAME) or _get_token(authorization)
    if token:
        try:
            with db_cursor(database="school_management") as (cur, _): cur.execute("DELETE FROM app_sessions WHERE token_hash=%s", (_token_hash(token),))
        except Exception as exc:
            logger.exception("Database error during logout")
            raise HTTPException(503, "Authentication service is temporarily unavailable.") from exc
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
    )
    return {"success": True}

@router.get("/verify")
def verify_session(request: Request, authorization: Optional[str] = Header(None)):
    return {
        "valid": True,
        "user": get_authenticated_user(
            authorization,
            request.cookies.get(SESSION_COOKIE_NAME),
        ),
    }

@router.post("/users")
def create_user(user: UserCreate, request: Request, authorization: Optional[str] = Header(None)):
    require_admin_session(request, authorization)
    if user.role not in ROLES: raise HTTPException(422, "Invalid role.")
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("INSERT INTO app_users (username,password_hash,role,display_name) VALUES (%s,%s,%s,%s)", (user.username.strip().lower(), _hash_password(user.password), user.role, user.display_name.strip()))
            return {"user_id": cur.lastrowid, "username": user.username.strip().lower(), "role": user.role}
    
    except mysql.connector.IntegrityError as exc:
        if exc.errno == 1062:  # MySQL duplicate-entry error
            logger.warning(
                "Duplicate user creation rejected: %s",
                user.username.strip().lower(),
            )
            raise HTTPException(
                status_code=409,
                detail="Username already exists.",
            ) from exc

        logger.exception("Database integrity error while creating user")
        raise HTTPException(
            status_code=500,
            detail="A database constraint prevented the user from being created.",
        ) from exc

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error while creating user")
        raise HTTPException(status_code=503, detail="Authentication service is temporarily unavailable.") from exc
        
