"""
Pydantic request model for Student creation and updates.
Maps to data spread across student_details, student_personal_details,
student_parent_details, and student_address tables.
"""

from datetime import date
from typing import Optional

from models.safe import SafeFormModel


class Student(SafeFormModel):
    # Basic identity
    full_name: str
    date_of_birth: date
    gender: str
    category: str
    blood_group: str

    # Academic / admission details
    admission_date: date
    admission_no: str
    aadhar_no_last_four: str
    apaar_no: str
    pen_no: str
    bpl: str
    class_name: Optional[str] = None
    section: Optional[str] = None

    # Parent details
    father_name: str
    father_aadhar_last_four: str
    father_phone: Optional[str] = None
    mother_name: str
    mother_aadhar_last_four: str
    mother_phone: Optional[str] = None

    # Address
    house_no: Optional[str] = None
    pincode: str
    street: str
    city: str
    state: str