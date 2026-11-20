"""Validation models for the salary / payroll API."""

from typing import Optional

from pydantic import Field

from models.safe import SafeFormModel

# staff_key looks like teacher_12, driver_3 or a custom key. Letters, digits, _ and - only.
STAFF_KEY = r"^[A-Za-z0-9_-]{1,50}$"
PERIOD = r"^\d{4}-(0[1-9]|1[0-2])$"
DATE = r"^\d{4}-\d{2}-\d{2}$"
PAYMENT_MODES = r"^(Cash|Bank Transfer|UPI|Cheque)$"
MAX_AMOUNT = 10_000_000  # 1 crore a month: far above any real salary, blocks typos like an extra 0


class SalaryTypeIn(SafeFormModel):
    name: str = Field(min_length=1, max_length=80)
    component_type: str = Field(pattern=r"^(earning|deduction)$")
    description: Optional[str] = Field(default=None, max_length=255)


class SalaryStructureItem(SafeFormModel):
    staff_key: str = Field(pattern=STAFF_KEY)
    head_id: int = Field(gt=0)
    amount: Optional[float] = Field(default=None, ge=0, le=MAX_AMOUNT)  # None = not applicable


class SalaryStructureBulk(SafeFormModel):
    items: list[SalaryStructureItem] = Field(min_length=1, max_length=5000)


class SalaryPaymentIn(SafeFormModel):
    """Record one staff member's salary for one month, or put it back to Pending."""

    staff_key: str = Field(pattern=STAFF_KEY)
    period: str = Field(pattern=PERIOD)
    status: str = Field(pattern=r"^(Paid|Pending)$")
    payment_date: Optional[str] = Field(default=None, pattern=DATE)
    payment_mode: Optional[str] = Field(default=None, pattern=PAYMENT_MODES)
    reference_no: Optional[str] = Field(default=None, max_length=50)
    remarks: Optional[str] = Field(default=None, max_length=255)


class SalaryDisburseIn(SafeFormModel):
    """Pay every unpaid staff member of a month in one go."""

    period: str = Field(pattern=PERIOD)
    payment_date: str = Field(pattern=DATE)
    payment_mode: str = Field(pattern=PAYMENT_MODES)
    section: Optional[str] = Field(default=None, pattern=r"^(teaching|non_teaching)$")  # None = everyone
    remarks: Optional[str] = Field(default=None, max_length=255)


class SalaryBankIn(SafeFormModel):
    bank_name: Optional[str] = Field(default=None, max_length=100)
    account_number: Optional[str] = Field(default=None, pattern=r"^\d{6,20}$")
    ifsc_code: Optional[str] = Field(default=None, pattern=r"^[A-Za-z]{4}0[A-Za-z0-9]{6}$")
    pan_number: Optional[str] = Field(default=None, pattern=r"^[A-Za-z]{5}\d{4}[A-Za-z]$")
    upi_id: Optional[str] = Field(default=None, pattern=r"^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,31}$")
    payment_mode: Optional[str] = Field(default=None, pattern=PAYMENT_MODES)
