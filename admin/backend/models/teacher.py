"""
Pydantic request model for Teacher creation and updates.
Maps to teacher_details, teacher_address, and teacher_personal_details tables.
"""

from datetime import date
from typing import Optional

from models.safe import SafeFormModel


class Teacher(SafeFormModel):
    # Basic identity
    full_name: str
    date_of_birth: date
    gender: str
    category: str
    blood_group: str
    phone: str
    email: str

    # Address
    house_no: Optional[str] = None
    street: str
    city: str
    state: str
    pincode: str

    # Professional details
    date_of_joining: date
    joining_no: Optional[str] = None
    aadhar_no: str
    qualification: str
    post: str
    cl: int  # Casual Leave balance
