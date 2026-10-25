"""
Main FastAPI Application Entrypoint.
Initializes FastAPI, mounts CORS middleware, and includes all modular feature routers.
"""

import base64
import logging
import os
import secrets

logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from starlette.concurrency import run_in_threadpool

from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import get_db_connection
from security import get_allowed_origins
from routers.dashboard import router as dashboard_router
from routers.teachers import router as teachers_router
from routers.students import router as students_router
from routers.subjects import router as subjects_router
from routers.attendance import router as attendance_router
from routers.fees import router as fees_router
from routers.exams import router as exams_router
from routers.notices import router as notices_router
from routers.timetable import router as timetable_router
from routers.calendar import router as calendar_router
from routers.settings import router as settings_router
from routers.transport import router as transport_router
from routers.auth import router as auth_router
from routers.auth import (
    SESSION_COOKIE_NAME,
    get_authenticated_user,
    require_admin_session,
    provision_configured_admin,
)
from rbac import require_permission

from pathlib import Path
from dotenv import load_dotenv

_ENV_FILE = Path(__file__).resolve().parent / ".env"
if _ENV_FILE.is_file():
    load_dotenv(dotenv_path=_ENV_FILE)

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Provision the configured admin before serving requests."""
    await run_in_threadpool(provision_configured_admin)
    yield


app = FastAPI(
    title="School Management System API",
    description="Backend API for School Administration, Students, Teachers, and Academics",
    version="1.0.0",
    lifespan=lifespan,
)

# Cookie sessions require credentialed CORS. Origins remain explicitly validated
# by get_allowed_origins(); wildcard origins must never be used here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# @app.on_event("startup")
# def provision_database_admin() -> None:
#     """Fail startup rather than serving an API without database-backed authentication."""
#     provision_configured_admin()

DOCS_PATHS = {
    "/docs",
    "/docs/oauth2-redirect",
    "/redoc",
    "/openapi.json",
    "/api/docs",
    "/api/docs/oauth2-redirect",
    "/api/redoc",
}


def _verify_docs_credentials(auth_header: str | None) -> bool:
    """Verify HTTP Basic credentials for documentation endpoints."""
    docs_user = os.getenv("DOCS_USERNAME", "").strip()
    docs_pass = os.getenv("DOCS_PASSWORD", "")
    if not docs_user or not docs_pass:
        return False
    if not auth_header:
        return False
    scheme, _, param = auth_header.partition(" ")
    if scheme.lower() != "basic" or not param.strip():
        return False
    try:
        decoded = base64.b64decode(param.strip()).decode("utf-8")
        username, sep, password = decoded.partition(":")
        if not sep:
            return False
        return (
            secrets.compare_digest(username, docs_user)
            and secrets.compare_digest(password, docs_pass)
        )
    except Exception:
        return False


@app.middleware("http")
async def enforce_api_rbac(request: Request, call_next):
    """Authenticate, authorize, and apply origin-based CSRF protection."""
    path = request.url.path
    normalized_path = path.rstrip("/") if path != "/" else "/"

    # Cookie authentication is ambient browser credential material. Require a
    # configured frontend Origin for its unsafe requests. Login permits no
    # Origin only for non-browser clients, but rejects a browser Origin that is
    # not explicitly configured; this prevents login CSRF without trusting Host.
    origin = request.headers.get("origin")
    trusted_origins = set(get_allowed_origins())
    is_unsafe_method = request.method not in {"GET", "HEAD", "OPTIONS"}
    has_session_cookie = bool(request.cookies.get(SESSION_COOKIE_NAME))
    if is_unsafe_method and path == "/api/auth/login":
        if origin is not None and origin not in trusted_origins:
            return JSONResponse({"detail": "Untrusted request origin."}, status_code=403)
    elif is_unsafe_method and has_session_cookie:
        if origin not in trusted_origins:
            return JSONResponse(
                {"detail": "A trusted Origin is required for cookie-authenticated changes."},
                status_code=403,
            )

    if normalized_path in DOCS_PATHS:
        if not _verify_docs_credentials(request.headers.get("Authorization")):
            return JSONResponse(
                {"detail": "Invalid or missing documentation credentials."},
                status_code=401,
                headers={"WWW-Authenticate": "Basic"},
            )
        return await call_next(request)

    if (
        path in {
            "/",
            "/api/auth/login",
            "/api/auth/logout",
            "/api/auth/verify",
        }
        or request.method == "OPTIONS"
    ):
        return await call_next(request)
    try:
        user = get_authenticated_user(
            request.headers.get("Authorization"),
            request.cookies.get(SESSION_COOKIE_NAME),
        )
        require_permission(user["role"], request.method, path)
        request.state.user = user
    except HTTPException as exc:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers or {})
    return await call_next(request)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add baseline security headers to every API response."""
    response = await call_next(request)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")

    return response


@app.get("/")
def home():
    """Health check endpoint confirming backend server availability."""
    return {"message": "School Management Backend is running"}


@app.get("/test-db", dependencies=[Depends(require_admin_session)])
def test_database():
    """Diagnostic endpoint checking MySQL database connectivity."""
    connection = None
    try:
        connection = get_db_connection()
        if connection.is_connected():
            return {"message": "MySQL connection successful"}
        return {"message": "MySQL connection failed"}
    except Exception as exc:
        logger.error("Database connectivity test failed: %s", exc)
        return {"message": "MySQL connection failed"}
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass


# Mount all modular feature routers
# Public authentication endpoints
app.include_router(auth_router)

# Protected management endpoints — enforced by the RBAC middleware above.
admin_routers = [
    dashboard_router,
    teachers_router,
    students_router,
    subjects_router,
    attendance_router,
    fees_router,
    exams_router,
    notices_router,
    timetable_router,
    calendar_router,
    settings_router,
    transport_router,
]

for router in admin_routers:
    app.include_router(router)



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
