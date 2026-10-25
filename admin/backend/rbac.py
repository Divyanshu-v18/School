
"""Server-side role and endpoint permission policy."""

from fastapi import HTTPException

ROLES = {"admin", "teacher", "staff"}

# Each entry is an exact path or a path template.
# For example, /students/{student_id} matches one student ID,
# but does not match /students/details.
ROLE_PERMISSIONS = {
    "teacher": {
        ("GET", "/students"),
        ("GET", "/subjects"),
        ("GET", "/teachers"),
        ("GET", "/attendance"),
        ("POST", "/attendance"),
        ("GET", "/teacher-attendance"),
        ("POST", "/teacher-attendance"),
        ("GET", "/exams"),
        ("GET", "/timetable"),
        ("GET", "/calendar/events"),
        ("GET", "/notices"),
    },
    "staff": {
        ("GET", "/students"),
        ("GET", "/teachers"),
        ("GET", "/subjects"),
        ("GET", "/timetable"),
        ("GET", "/calendar/events"),
        ("GET", "/notices"),
        ("GET", "/fees/payments"),
        ("GET", "/fees/structures"),
        ("POST", "/fees/payments"),
        ("GET", "/transport/drivers"),
        ("GET", "/transport/students"),
        ("GET", "/transport/vehicles"),
        ("POST", "/transport/students"),
    },
}


def _path_matches(template: str, path: str) -> bool:
    """Match an exact route template, including single path parameters."""
    template_parts = template.strip("/").split("/")
    path_parts = path.strip("/").split("/")

    if len(template_parts) != len(path_parts):
        return False

    return all(
        (
            expected.startswith("{")
            and expected.endswith("}")
            and bool(actual)
        )
        or expected == actual
        for expected, actual in zip(template_parts, path_parts)
    )


def is_allowed(role: str, method: str, path: str) -> bool:
    """Return whether a role may use a specific method and endpoint."""
    if role not in ROLES:
        return False

    # Admin access is intentionally unrestricted for non-public API routes.
    if role == "admin":
        return True

    # Protect personally identifiable student and teacher detail views.
    if path in {"/students/details", "/teachers/details"}:
        return False

    return any(
        allowed_method == method
        and _path_matches(allowed_path, path)
        for allowed_method, allowed_path in ROLE_PERMISSIONS.get(role, set())
    )


def require_permission(role: str, method: str, path: str) -> None:
    """Raise 403 when the authenticated role lacks permission."""
    if not is_allowed(role, method, path):
        raise HTTPException(
            status_code=403,
            detail="Your role is not permitted to perform this action.",
        )
