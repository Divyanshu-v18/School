from models.safe import SafeFormModel
from typing import Optional
from datetime import date


class CalendarEvent(SafeFormModel):
    title: str
    description: Optional[str] = None
    event_date: date
    end_date: Optional[date] = None
    event_type: str = "Event"  # Holiday, Exam, Event, Meeting, Other
