from models.safe import SafeFormModel
from typing import Optional


class Subject(SafeFormModel):
    subject_name: str
    subject_code: str
    class_name: str
    description: Optional[str] = None
