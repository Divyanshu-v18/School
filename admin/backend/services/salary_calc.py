"""Pure salary helpers.

Nothing in this file imports FastAPI or MySQL, so every function can be unit tested
on its own (see tests/test_salary_calc.py).
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")
MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
SECTIONS = ("teaching", "non_teaching")
BASIC_CODE = "basic_pay"

_YEAR_RE = re.compile(r"^(\d{4})-(\d{4})$")
_PERIOD_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


# --------------------------------------------------------------------------- money
def money(value) -> Decimal:
    """Round any number (or None) to 2 decimal places, the way rupees are written."""
    if value is None or value == "":
        return Decimal("0.00")
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def percent_of(base, percent) -> Decimal:
    """`percent` % of `base`, rounded to paise."""
    return money(Decimal(str(base or 0)) * Decimal(str(percent or 0)) / Decimal(100))


def mask_account(number: str | None) -> str | None:
    """Show only the last 4 digits of a bank account number."""
    digits = (number or "").strip()
    if not digits:
        return None
    return "\u2022" * max(len(digits) - 4, 4) + digits[-4:]


# --------------------------------------------------------------------------- dates
def india_today() -> date:
    """Today's date in India (the server itself may run in UTC)."""
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


def default_academic_year(today: date) -> str:
    start = today.year if today.month >= 4 else today.year - 1
    return f"{start}-{start + 1}"


def parse_academic_year(value: str) -> int:
    """Return the start year of '2026-2027'. Raises ValueError for anything else."""
    match = _YEAR_RE.match(value or "")
    if not match or int(match.group(2)) != int(match.group(1)) + 1:
        raise ValueError("Invalid academic year.")
    return int(match.group(1))


def academic_year_periods(start_year: int) -> list[tuple[int, int]]:
    """The 12 payroll months of an academic year, April first."""
    return [(start_year, month) for month in range(4, 13)] + [(start_year + 1, month) for month in range(1, 4)]


def parse_period(value: str) -> tuple[int, int]:
    """Split 'YYYY-MM' into (year, month). Raises ValueError for anything else."""
    match = _PERIOD_RE.match(value or "")
    if not match:
        raise ValueError("Invalid payroll month.")
    return int(match.group(1)), int(match.group(2))


def period_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def period_label(year: int, month: int) -> str:
    return f"{MONTH_NAMES[month - 1]} {year}"


def is_future_period(year: int, month: int, today: date) -> bool:
    return (year, month) > (today.year, today.month)


def elapsed_periods(start_year: int, today: date) -> list[tuple[int, int]]:
    """Payroll months of the academic year that have started (the current month included)."""
    return [p for p in academic_year_periods(start_year) if not is_future_period(p[0], p[1], today)]


# --------------------------------------------------------------------------- salary types
def slugify_code(name: str, existing: set[str]) -> str:
    """Make a unique machine code like 'house_rent' from a salary type name."""
    base = re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")[:28] or "type"
    if base[0].isdigit():
        base = f"t_{base}"
    code, number = base, 2
    while code in existing or code == BASIC_CODE and base != BASIC_CODE:
        code = f"{base}_{number}"
        number += 1
    return code


# --------------------------------------------------------------------------- breakdown
def compute_breakdown(heads: list[dict], amounts: dict) -> dict:
    """Work out earnings, deductions and net pay for one staff member.

    heads    active salary types in display order ({head_id, code, name, component_type}).
    amounts  {head_id: amount} that this staff member has been given.
    Types with no amount (or 0) are left out of the lists.
    """
    earnings, deductions = [], []
    for head in heads:
        amount = money(amounts.get(head["head_id"]))
        if amount <= 0:
            continue
        item = {"head_id": head["head_id"], "code": head["code"], "name": head["name"], "amount": amount}
        (earnings if head["component_type"] == "earning" else deductions).append(item)
    gross = sum((item["amount"] for item in earnings), Decimal("0.00"))
    total_deductions = sum((item["amount"] for item in deductions), Decimal("0.00"))
    return {
        "earnings": earnings,
        "deductions": deductions,
        "gross": money(gross),
        "total_deductions": money(total_deductions),
        "net": money(gross - total_deductions),
    }


def breakdown_to_json(breakdown: dict) -> dict:
    """JSON-safe copy (amounts as '45000.00' strings) that is stored with a payment."""
    def convert(items):
        return [{**item, "amount": str(money(item["amount"]))} for item in items]
    return {"earnings": convert(breakdown["earnings"]), "deductions": convert(breakdown["deductions"])}


def breakdown_from_json(data) -> dict:
    """Inverse of breakdown_to_json; tolerates missing or damaged data."""
    data = data if isinstance(data, dict) else {}

    def convert(items):
        out = []
        for item in items if isinstance(items, list) else []:
            if isinstance(item, dict) and "name" in item:
                out.append({**item, "amount": money(item.get("amount"))})
        return out

    return {"earnings": convert(data.get("earnings")), "deductions": convert(data.get("deductions"))}


# --------------------------------------------------------------------------- staff
def classify_section(registered_type: str | None, post: str | None, is_non_teaching_post) -> str:
    """Decide whether a shared teacher_details row is Teaching or Non-Teaching staff.

    The section recorded when the person was created wins. Older rows without a record
    fall back to the designation, the same rule the Non-Teaching Staff page uses, so
    nobody is ever listed (and paid) in both sections.
    """
    if registered_type == "non_teaching":
        return "non_teaching"
    if registered_type == "teaching":
        return "teaching"
    return "non_teaching" if is_non_teaching_post(post or "") else "teaching"
