"""
Non-Teaching Staff Management router.
Handles listing, adding, viewing, updating, and deleting non-teaching personnel,
including administrative, transport/drivers, accounts, library, and support staff.
"""

import json
import logging
import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from database import db_cursor
from models.non_teaching_staff import NonTeachingStaffIn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/non-teaching-staff", tags=["Non-Teaching Staff"])


def is_non_teaching_post(post: str) -> bool:
    """Check if designation belongs to non-teaching personnel."""
    if not post:
        return True
    p = post.strip().lower()
    non_teaching_keywords = [
        "driver", "peon", "clerk", "accountant", "librarian", "security",
        "guard", "cleaner", "sweeper", "employee", "admin", "attendant",
        "helper", "nurse", "office", "lab assistant", "receptionist",
        "manager", "counselor", "warden", "technician"
    ]
    for ntk in non_teaching_keywords:
        if ntk in p:
            return True

    teaching_keywords = [
        "teacher", "faculty", "pgt", "tgt", "prt", "lecturer",
        "professor", "headmaster", "principal", "instructor", "educator"
    ]
    for tk in teaching_keywords:
        if tk in p:
            return False

    return True


def get_department_for_post(post: str) -> str:
    """Infer school department based on designation/post."""
    p = (post or "").strip().lower()
    if "driver" in p or "transport" in p or "bus" in p:
        return "Transport"
    if "account" in p or "cashier" in p or "finance" in p:
        return "Finance & Accounts"
    if "librar" in p:
        return "Library"
    if "lab" in p:
        return "Laboratory"
    if "peon" in p or "cleaner" in p or "guard" in p or "security" in p or "attendant" in p or "sweeper" in p:
        return "Support & Maintenance"
    if "clerk" in p or "reception" in p or "office" in p or "admin" in p or "employee" in p:
        return "Administration"
    return "Support Staff"


def _get_setting(cursor, key: str, default=None):
    """Retrieve JSON-encoded setting from school_settings."""
    cursor.execute("SELECT setting_value FROM school_settings WHERE setting_key = %s", (key,))
    row = cursor.fetchone()
    if not row or not row.get("setting_value"):
        return default
    try:
        return json.loads(row["setting_value"])
    except Exception:
        return default


def _set_setting(cursor, key: str, value) -> None:
    """Store a JSON setting used by the staff directory views."""
    cursor.execute(
        """
        INSERT INTO school_settings (setting_key, setting_value)
        VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        """,
        (key, json.dumps(value)),
    )


def _get_staff_directory_types(cursor) -> dict:
    """Read explicit Teacher/Non-Teaching section membership."""
    directory_types = _get_setting(cursor, "staff_directory_types", default={})
    return directory_types if isinstance(directory_types, dict) else {}


@router.get("")
def list_non_teaching_staff():
    """Return all non-teaching staff across the school."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cursor, _):
            staff_list = []

            # 1. Non-teaching staff from teacher_details / teacher_personal_details
            cursor.execute(
                """
                SELECT
                    td.teacher_id,
                    td.full_name,
                    td.phone,
                    td.email,
                    td.gender,
                    tpd.post,
                    tpd.qualification,
                    tpd.date_of_joining,
                    tpd.cl
                FROM teacher_details td
                LEFT JOIN teacher_personal_details tpd ON td.teacher_id = tpd.teacher_id
                ORDER BY td.teacher_id
                """
            )
            all_teachers = cursor.fetchall()
            directory_types = _get_staff_directory_types(cursor)
            for t in all_teachers:
                post = t.get("post") or "Employee"
                # Explicit section membership takes precedence.  The post
                # check keeps existing installations working until each older
                # record has been edited or re-saved.
                registered_type = directory_types.get(str(t["teacher_id"]))
                if registered_type == "non_teaching" or (
                    registered_type is None and is_non_teaching_post(post)
                ):
                    t_id = t["teacher_id"]
                    staff_list.append({
                        "staff_key": f"teacher_{t_id}",
                        "raw_id": t_id,
                        "staff_id": f"EMP-{1000 + t_id}",
                        "full_name": t["full_name"],
                        "phone": t.get("phone") or "-",
                        "email": t.get("email") or "-",
                        "gender": t.get("gender") or "Male",
                        "post": post,
                        "department": get_department_for_post(post),
                        "qualification": t.get("qualification") or "Graduate",
                        "date_of_joining": str(t.get("date_of_joining")) if t.get("date_of_joining") else "2020-06-01",
                        "cl_balance": t.get("cl") if t.get("cl") is not None else 12,
                        "source": "employee"
                    })

            # 2. Transport drivers from transport_drivers
            try:
                cursor.execute(
                    """
                    SELECT d.driver_id, d.full_name, d.phone, d.license_number, d.status,
                           v.vehicle_number, v.route_name
                    FROM transport_drivers d
                    LEFT JOIN transport_vehicles v ON d.vehicle_id = v.vehicle_id
                    ORDER BY d.driver_id
                    """
                )
                drivers = cursor.fetchall()
                for d in drivers:
                    d_id = d["driver_id"]
                    staff_list.append({
                        "staff_key": f"driver_{d_id}",
                        "raw_id": d_id,
                        "staff_id": f"DRV-{100 + d_id}",
                        "full_name": d["full_name"],
                        "phone": d.get("phone") or "-",
                        "email": f"driver{d_id}@abcpublic.edu",
                        "gender": "Male",
                        "post": "School Bus Driver",
                        "department": "Transport",
                        "qualification": "Commercial Driver License (DL)",
                        "date_of_joining": "2021-04-10",
                        "cl_balance": 10,
                        "license_number": d.get("license_number"),
                        "vehicle_number": d.get("vehicle_number"),
                        "status": d.get("status") or "Active",
                        "source": "driver"
                    })
            except Exception as exc:
                logger.warning("Error fetching drivers: %s", exc)

            # 3. Custom staff from school_settings
            custom_staff = _get_setting(cursor, "salary_custom_staff", default=[])
            for cs in custom_staff:
                if not cs.get("is_teaching", False):
                    staff_list.append(cs)

            return staff_list
    except Exception:
        logger.exception("Error listing non-teaching staff")
        raise HTTPException(status_code=500, detail="Could not retrieve non-teaching staff.")


@router.get("/{staff_key}")
def get_non_teaching_staff_details(staff_key: str):
    """Retrieve complete profile, address, and employment details for a non-teaching staff member."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cursor, _):
            # Check if this is a driver
            if staff_key.startswith("driver_") or staff_key.startswith("DRV-"):
                driver_id = int(staff_key.split("_")[-1].replace("DRV-", ""))
                cursor.execute(
                    """
                    SELECT d.*, v.vehicle_number, v.vehicle_type, v.route_name
                    FROM transport_drivers d
                    LEFT JOIN transport_vehicles v ON d.vehicle_id = v.vehicle_id
                    WHERE d.driver_id = %s
                    """,
                    (driver_id,)
                )
                driver = cursor.fetchone()
                if not driver:
                    raise HTTPException(status_code=404, detail="Staff member not found")

                return {
                    "staff_key": f"driver_{driver_id}",
                    "staff_id": f"DRV-{100 + driver_id}",
                    "full_name": driver["full_name"],
                    "phone": driver["phone"],
                    "email": f"driver{driver_id}@abcpublic.edu",
                    "gender": "Male",
                    "category": "General",
                    "blood_group": "B+",
                    "post": "School Bus Driver",
                    "department": "Transport",
                    "qualification": "Commercial Driver License",
                    "date_of_joining": "2021-04-10",
                    "cl_balance": 10,
                    "address": {
                        "house_no": "12",
                        "street": "Transport Staff Quarters",
                        "city": "City",
                        "state": "State",
                        "pincode": "110001"
                    },
                    "professional": {
                        "joining_no": f"DRV{100 + driver_id}",
                        "license_number": driver.get("license_number"),
                        "vehicle_number": driver.get("vehicle_number") or "Not assigned",
                        "route_name": driver.get("route_name") or "Standard Route",
                        "status": driver.get("status") or "Active"
                    },
                    "source": "driver"
                }

            # Check in teacher_details
            t_id = int(staff_key.split("_")[-1].replace("EMP-", ""))
            cursor.execute(
                """
                SELECT
                    td.*,
                    tpd.date_of_joining,
                    tpd.joining_no,
                    tpd.aadhar_no,
                    tpd.qualification,
                    tpd.post,
                    tpd.cl,
                    ta.house_no,
                    ta.street,
                    ta.city,
                    ta.state,
                    ta.pincode
                FROM teacher_details td
                LEFT JOIN teacher_personal_details tpd ON td.teacher_id = tpd.teacher_id
                LEFT JOIN teacher_address ta ON td.teacher_id = ta.teacher_id
                WHERE td.teacher_id = %s
                """,
                (t_id,)
            )
            staff = cursor.fetchone()
            if not staff:
                raise HTTPException(status_code=404, detail="Staff member not found")

            post = staff.get("post") or "Employee"
            return {
                "staff_key": f"teacher_{t_id}",
                "staff_id": f"EMP-{1000 + t_id}",
                "full_name": staff["full_name"],
                "phone": staff["phone"],
                "email": staff["email"],
                "gender": staff.get("gender") or "Male",
                "category": staff.get("category") or "General",
                "blood_group": staff.get("blood_group") or "B+",
                "post": post,
                "department": get_department_for_post(post),
                "qualification": staff.get("qualification") or "Graduate",
                "date_of_joining": str(staff.get("date_of_joining")) if staff.get("date_of_joining") else "2020-06-01",
                "cl_balance": staff.get("cl") if staff.get("cl") is not None else 12,
                "address": {
                    "house_no": staff.get("house_no") or "",
                    "street": staff.get("street") or "Campus Road",
                    "city": staff.get("city") or "City",
                    "state": staff.get("state") or "State",
                    "pincode": staff.get("pincode") or "110001"
                },
                "professional": {
                    "joining_no": staff.get("joining_no") or f"JN{t_id:04d}",
                    "aadhar_no": staff.get("aadhar_no") or f"••••••••{t_id * 111 % 9000 + 1000}",
                    "status": "Active"
                },
                "source": "employee"
            }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error getting non-teaching staff details for %s", staff_key)
        raise HTTPException(status_code=500, detail="Could not retrieve staff details.")


@router.post("")
def add_non_teaching_staff(staff: NonTeachingStaffIn):
    """Register a new non-teaching staff member."""
    try:
        with db_cursor(database="school_management", dictionary=True, autocommit=True) as (cursor, _):
            # Check uniqueness
            cursor.execute("SELECT teacher_id FROM teacher_details WHERE phone = %s OR email = %s", (staff.phone, staff.email))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="A staff member with this phone or email already exists.")

            dob = staff.date_of_birth.isoformat() if staff.date_of_birth else "1992-01-01"
            cursor.execute(
                """
                INSERT INTO teacher_details (full_name, date_of_birth, gender, category, blood_group, phone, email)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (staff.full_name, dob, staff.gender, staff.category, staff.blood_group, staff.phone, staff.email)
            )
            t_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO teacher_address (teacher_id, house_no, street, city, state, pincode)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (t_id, staff.house_no or "12", staff.street, staff.city, staff.state, staff.pincode)
            )

            doj = staff.date_of_joining.isoformat() if staff.date_of_joining else datetime.date.today().isoformat()
            joining_no = staff.joining_no or f"NT{t_id:04d}"
            aadhar = staff.aadhar_no or f"8888{t_id:04d}5678"

            cursor.execute(
                """
                INSERT INTO teacher_personal_details (teacher_id, date_of_joining, joining_no, aadhar_no, qualification, post, cl)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (t_id, doj, joining_no, aadhar, staff.qualification, staff.post, staff.cl)
            )

            # teacher_details is shared with the Teacher module.  Record the
            # owning section so Salary can fetch this person as non-teaching
            # staff without relying on designation keywords.
            directory_types = _get_staff_directory_types(cursor)
            directory_types[str(t_id)] = "non_teaching"
            _set_setting(cursor, "staff_directory_types", directory_types)

            return {
                "message": "Non-teaching staff member added successfully",
                "staff_key": f"teacher_{t_id}",
                "staff_id": f"EMP-{1000 + t_id}",
                "full_name": staff.full_name,
                "post": staff.post,
                "department": get_department_for_post(staff.post)
            }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error adding non-teaching staff")
        raise HTTPException(status_code=500, detail="Could not add non-teaching staff.")


@router.put("/{staff_key}")
def update_non_teaching_staff(staff_key: str, staff: NonTeachingStaffIn):
    """Update details for an existing non-teaching staff member."""
    try:
        with db_cursor(database="school_management", dictionary=True, autocommit=True) as (cursor, _):
            if staff_key.startswith("driver_"):
                driver_id = int(staff_key.replace("driver_", ""))
                cursor.execute(
                    """
                    UPDATE transport_drivers
                    SET full_name = %s, phone = %s
                    WHERE driver_id = %s
                    """,
                    (staff.full_name, staff.phone, driver_id)
                )
                return {"message": "Driver staff record updated successfully"}

            t_id = int(staff_key.split("_")[-1].replace("EMP-", ""))
            dob = staff.date_of_birth.isoformat() if staff.date_of_birth else "1992-01-01"
            cursor.execute(
                """
                UPDATE teacher_details
                SET full_name = %s, date_of_birth = %s, gender = %s, category = %s, blood_group = %s, phone = %s, email = %s
                WHERE teacher_id = %s
                """,
                (staff.full_name, dob, staff.gender, staff.category, staff.blood_group, staff.phone, staff.email, t_id)
            )

            cursor.execute(
                """
                UPDATE teacher_personal_details
                SET qualification = %s, post = %s, cl = %s
                WHERE teacher_id = %s
                """,
                (staff.qualification, staff.post, staff.cl, t_id)
            )

            cursor.execute(
                """
                UPDATE teacher_address
                SET house_no = %s, street = %s, city = %s, state = %s, pincode = %s
                WHERE teacher_id = %s
                """,
                (staff.house_no or "", staff.street, staff.city, staff.state, staff.pincode, t_id)
            )

            return {"message": "Staff member updated successfully"}
    except Exception:
        logger.exception("Error updating non-teaching staff")
        raise HTTPException(status_code=500, detail="Could not update staff member.")


@router.delete("/{staff_key}")
def delete_non_teaching_staff(staff_key: str):
    """Delete a non-teaching staff member."""
    try:
        with db_cursor(database="school_management", dictionary=True, autocommit=True) as (cursor, _):
            if staff_key.startswith("driver_"):
                driver_id = int(staff_key.replace("driver_", ""))
                cursor.execute("DELETE FROM transport_drivers WHERE driver_id = %s", (driver_id,))
                return {"message": "Driver staff record deleted successfully"}

            t_id = int(staff_key.split("_")[-1].replace("EMP-", ""))
            cursor.execute("DELETE FROM teacher_details WHERE teacher_id = %s", (t_id,))
            return {"message": "Staff member deleted successfully"}
    except Exception:
        logger.exception("Error deleting non-teaching staff")
        raise HTTPException(status_code=500, detail="Could not delete staff member.")
