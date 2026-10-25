from models.safe import SafeFormModel
from typing import Optional
from datetime import date


class Exam(SafeFormModel):
    exam_name: str
    class_name: str
    subject: str
    exam_date: date
    max_marks: int = 100


class ExamResult(SafeFormModel):
    exam_id: int
    student_id: int
    student_name: str
    marks_obtained: int
    grade: Optional[str] = None
