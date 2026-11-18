"""
Pydantic validation models for Non-Teaching Staff management.
"""

from datetime import date
from typing import Optional
from pydantic import Field
from models.safe import SafeFormModel


class NonTeachingStaffIn(SafeFormModel):
    """Payload to create or update a non-teaching staff member."""
    full_name: str = Field(min_length=2, max_length=60)
    date_of_birth: Optional[date] = None
    gender: str = Field(default="Male", max_length=10)
    category: str = Field(default="General", max_length=20)
    blood_group: str = Field(default="B+", max_length=10)
    phone: str = Field(min_length=10, max_length=15)
    email: str = Field(min_length=5, max_length=100)

    # Address
    house_no: Optional[str] = Field(default=None, max_length=20)
    street: str = Field(default="Main Campus Road", max_length=200)
    city: str = Field(default="City", max_length=50)
    state: str = Field(default="State", max_length=50)
    pincode: str = Field(default="110001", max_length=10)

    # Professional
    date_of_joining: Optional[date] = None
    joining_no: Optional[str] = Field(default=None, max_length=30)
    aadhar_no: Optional[str] = Field(default=None, max_length=20)
    qualification: str = Field(default="Graduate", max_length=50)
    post: str = Field(min_length=2, max_length=50)
    department: Optional[str] = Field(default=None, max_length=50)
    cl: int = Field(default=12, ge=0)
