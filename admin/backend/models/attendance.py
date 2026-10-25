from models.safe import SafeFormModel
from datetime import date
from typing import Optional


class Attendance(SafeFormModel):
    student_id: int
    student_name: str
    class_name: str
    section: str
    date: date
    status: str  # Present, Absent


class TeacherAttendance(SafeFormModel):
    teacher_id: int
    teacher_name: str
    post: Optional[str] = None
    date: date
    status: str  # Present, Absent
    time_in: Optional[str] = "09:00"
    time_out: Optional[str] = "16:00"
