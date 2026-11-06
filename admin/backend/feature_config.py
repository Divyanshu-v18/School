"""Central configuration for enabling and disabling school modules.

Change a feature value to True or False and restart the FastAPI application.
The same configuration is used by the API middleware and the frontend sidebar.
"""

FEATURES = {
    "exams": True,
    "students": True,
    "teachers": True,
    "classes": True,
    "subjects": True,
    "attendance": True,
    "fees": False,
    "assignments": True,
    "notices": True,
    "timetable": True,
    "library": False,
    "transport": True,
    "calendar": True,
}

# API path prefixes belonging to each feature. Prefix matching is performed
# on path boundaries, so /students/12 matches but /students-extra does not.
FEATURE_ROUTE_PREFIXES = {
    "students": ("/students",),
    "teachers": ("/teachers",),
    "classes": ("/classes", "/class"),
    "subjects": ("/subjects",),
    "attendance": ("/attendance", "/teacher-attendance"),
    "fees": ("/fees",),
    "assignments": ("/assignments",),
    "exams": ("/exams",),
    "notices": ("/notices",),
    "timetable": ("/timetable",),
    "library": ("/library",),
    "transport": ("/transport",),
    "calendar": ("/calendar",),
}


def is_feature_enabled(feature_name: str) -> bool:
    """Return True only when a known feature is explicitly enabled."""
    return FEATURES.get(feature_name, False) is True


def get_feature_for_path(path: str) -> str | None:
    """Return the feature owning an API path, or None for shared endpoints."""
    normalized_path = path.rstrip("/") or "/"

    for feature_name, prefixes in FEATURE_ROUTE_PREFIXES.items():
        for prefix in prefixes:
            if normalized_path == prefix or normalized_path.startswith(prefix + "/"):
                return feature_name

    return None

def get_enabled_features() -> dict[str, bool]:
    """Return a copy of the complete feature configuration."""
    return FEATURES.copy()
 