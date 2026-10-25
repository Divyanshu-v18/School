"""Shared validation for text received from browser forms."""
import re
from pydantic import BaseModel, ConfigDict, field_validator

_HTML_MARKUP = re.compile(r"[<>]")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SETTING_KEY = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

def validate_safe_text(value: str) -> str:
    if len(value) > 2000:
        raise ValueError("Text values must not exceed 2000 characters.")
    if _HTML_MARKUP.search(value) or _CONTROL_CHARS.search(value):
        raise ValueError("HTML markup and control characters are not allowed.")
    return value.strip()

def validate_settings(settings: dict) -> dict[str, str]:
    if len(settings) > 50:
        raise ValueError("Too many settings supplied.")
    cleaned = {}
    for key, value in settings.items():
        if not isinstance(key, str) or not _SETTING_KEY.fullmatch(key):
            raise ValueError("Invalid setting key.")
        if not isinstance(value, (str, int, float, bool)):
            raise ValueError("Invalid setting value.")
        cleaned[key] = validate_safe_text(str(value))
    return cleaned

class SafeFormModel(BaseModel):
    """Reject markup and control characters; HTML is never accepted as school data."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("*", mode="before")
    @classmethod
    def reject_unsafe_text(cls, value):
        if not isinstance(value, str):
            return value
        return validate_safe_text(value)



