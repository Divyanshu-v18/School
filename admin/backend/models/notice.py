from models.safe import SafeFormModel
from typing import Optional


class Notice(SafeFormModel):
    title: str
    content: str
    category: str = "General"  # General, Academic, Event, Holiday, Urgent
    is_active: bool = True
