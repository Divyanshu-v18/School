"""Validation models shared by the fee-management API."""

from typing import Optional

from pydantic import Field, field_validator

from models.safe import SafeFormModel


class FeeOverviewQuery(SafeFormModel):
    """Academic-year filter used by the fee overview dashboard."""

    academic_year: str = Field(pattern=r"^\d{4}-\d{4}$")

    @field_validator("academic_year")
    @classmethod
    def validate_year_range(cls, value: str) -> str:
        start, end = (int(part) for part in value.split("-"))
        if end != start + 1:
            raise ValueError("Academic year must contain consecutive years.")
        return value


class FeeHeadIn(SafeFormModel):
    name: str = Field(min_length=1, max_length=80)
    frequency: str = Field(pattern=r"^(monthly|quarterly|half_yearly|yearly|one_time)$")
    due_day: Optional[int] = Field(default=None, ge=1, le=28)
    description: Optional[str] = Field(default=None, max_length=255)
    late_fee: Optional[float] = Field(default=None, ge=0)


class FeeStructureItem(SafeFormModel):
    class_name: str = Field(min_length=1, max_length=40)
    head_id: int = Field(gt=0)
    amount: Optional[float] = Field(default=None, ge=0)


class FeeStructureBulk(SafeFormModel):
    academic_year: str = Field(pattern=r"^\d{4}-\d{4}$")
    items: list[FeeStructureItem] = Field(min_length=1, max_length=300)


class FeePaymentUpdate(SafeFormModel):
    """Admin update of one fee installment (a month, or a whole non-monthly fee)."""

    academic_year: str = Field(pattern=r"^\d{4}-\d{4}$")
    student_id: int = Field(gt=0)
    student_name: Optional[str] = Field(default=None, max_length=60)
    fee_type: str = Field(min_length=1, max_length=50)
    period: str = Field(pattern=r"^(\d{4}-(0[1-9]|1[0-2])|ALL)$")
    status: str = Field(pattern=r"^(Paid|Partial|Pending)$")
    amount_paid: Optional[float] = Field(default=None, gt=0)
    payment_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    payment_mode: Optional[str] = Field(default=None, pattern=r"^(Cash|Online|Cheque|UPI)$")
    remarks: Optional[str] = Field(default=None, max_length=255)
    waive_fine: Optional[bool] = None

class FineWaiverUpdate(SafeFormModel):
    """Admin update for waiving a student's late fee."""

    academic_year: str = Field(pattern=r"^\d{4}-\d{4}$")
    student_id: int = Field(gt=0)
    fee_type: str = Field(min_length=1, max_length=80)
    period: str = Field(pattern=r"^(\d{4}-(0[1-9]|1[0-2])|ALL)$")
    waived: bool
    reason: Optional[str] = Field(default=None, max_length=255)