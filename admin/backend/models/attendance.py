from datetime import date, timedelta
from typing import Optional

from pydantic import Field, field_validator

from models.safe import SafeFormModel


def _reject_future(value: date) -> date:
    # One day of tolerance: the server may run in a different time zone than the school.
    if value > date.today() + timedelta(days=1):
        raise ValueError("Attendance cannot be marked for a future date.")
    return value


class Attendance(SafeFormModel):
    student_id: int
    student_name: str
    class_name: str
    section: str
    date: date
    status: str = Field(pattern=r"^(Present|Absent)$")

    @field_validator("date")
    @classmethod
    def date_not_in_future(cls, value):
        return _reject_future(value)


class TeacherAttendance(SafeFormModel):
    teacher_id: int
    teacher_name: str
    post: Optional[str] = None
    date: date
    status: str = Field(pattern=r"^(Present|Absent)$")
    # None = keep the stored time of an existing record (a new record gets 09:00 / 16:00)
    time_in: Optional[str] = None
    time_out: Optional[str] = None

    @field_validator("date")
    @classmethod
    def date_not_in_future(cls, value):
        return _reject_future(value)