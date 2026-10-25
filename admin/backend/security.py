
"""Security-related environment configuration and validation."""

import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

_ENV_FILE = Path(__file__).resolve().parent / ".env"
if _ENV_FILE.is_file():
    load_dotenv(dotenv_path=_ENV_FILE)
else:
    load_dotenv()


def get_allowed_origins() -> list[str]:
    """Return validated, explicitly configured frontend origins."""

    raw_origins = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500",
    )

    origins = [
        origin.strip().rstrip("/")
        for origin in raw_origins.split(",")
        if origin.strip()
    ]

    if not origins:
        raise RuntimeError(
            "CORS_ALLOWED_ORIGINS must list trusted frontend origins."
        )

    validated_origins = []

    for origin in origins:
        if origin == "*":
            raise RuntimeError(
                "CORS_ALLOWED_ORIGINS must not contain '*'."
            )

        try:
            parsed = urlsplit(origin)
            hostname = parsed.hostname
            port = parsed.port
        except ValueError as exc:
            raise RuntimeError(
                f"Invalid CORS origin: {origin!r}"
            ) from exc

        if (
            parsed.scheme not in ("http", "https")
            or not hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
            or origin.endswith(":")
        ):
            raise RuntimeError(
                f"Invalid CORS origin: {origin!r}. "
                "Use an origin such as https://school.example.com "
                "or http://localhost:5500, without a path."
            )

        # Accessing parsed.port above also validates the port range.
        if port is not None and not (1 <= port <= 65535):
            raise RuntimeError(f"Invalid port in CORS origin: {origin!r}")

        validated_origins.append(origin)

    return validated_origins
