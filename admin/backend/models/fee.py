from datetime import date
from typing import Optional, List
from pydantic import Field, field_validator
from models.safe import SafeFormModel


class FeeHeadIn(SafeFormModel):
    name: str = Field(min_length=1, max_length=80)
    frequency: str = "monthly"
    due_day: Optional[int] = Field(default=None, ge=1, le=28)
    description: Optional[str] = Field(default=None, max_length=255)


class FeeStructureItem(SafeFormModel):
    class_name: str = Field(min_length=1, max_length=40)
    head_id: int = Field(gt=0)
    amount: Optional[float] = Field(default=None, ge=0)


class FeeStructureBulk(SafeFormModel):
    academic_year: str = Field(min_length=4, max_length=9)
    items: List[FeeStructureItem]


class FeeStructureCopy(SafeFormModel):
    from_year: str
    to_year: str


class FeePaymentIn(SafeFormModel):
    student_id: int = Field(gt=0)
    student_name: str = Field(min_length=1, max_length=160)
    class_name: str = Field(min_length=1, max_length=40)
    fee_head_id: int = Field(gt=0)
    fee_type: str = Field(min_length=1, max_length=80)
    period: Optional[str] = None
    amount_paid: float = Field(gt=0)
    payment_date: Optional[date] = None
    payment_mode: str = "Cash"
    status: Optional[str] = "Paid"  # accepted for old frontend compatibility; server derives dues
    remarks: Optional[str] = Field(default=None, max_length=500)
