from models.safe import SafeFormModel
from typing import Optional
from datetime import date


class FeeStructure(SafeFormModel):
    class_name: str
    fee_type: str
    amount: float
    academic_year: str
    due_date: Optional[date] = None


class FeePayment(SafeFormModel):
    student_id: int
    student_name: str
    class_name: str
    fee_type: str
    amount_paid: float
    payment_date: date
    payment_mode: str  # Cash, Online, Cheque, UPI
    status: str  # Paid, Pending, Partial
    remarks: Optional[str] = None
