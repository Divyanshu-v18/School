from models.safe import SafeFormModel
from typing import Optional


class Timetable(SafeFormModel):
    class_name: str
    section: str
    day_of_week: str  # Monday to Saturday
    period_number: int
    subject: str
    teacher_name: Optional[str] = None
    start_time: str  # HH:MM format
    end_time: str    # HH:MM format
