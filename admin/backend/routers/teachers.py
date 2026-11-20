"""
Teacher management router.
Handles listing, adding, viewing, updating, and deleting teacher records.
"""

import json
import logging
from fastapi import APIRouter, HTTPException, Query
from database import db_cursor
from models.teacher import Teacher
from routers.salary import get_teacher_salary_view

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Teachers"])


def _get_staff_directory_types(cursor) -> dict:
    """Read explicit staff section membership from the shared settings store."""
    cursor.execute("SELECT setting_value FROM school_settings WHERE setting_key = %s", ("staff_directory_types",))
    row = cursor.fetchone()
    setting_value = row.get("setting_value") if isinstance(row, dict) else (row[0] if row else None)
    if not setting_value:
        return {}
    try:
        value = json.loads(setting_value)
        return value if isinstance(value, dict) else {}
    except (TypeError, ValueError):
        return {}


def _set_staff_directory_type(cursor, teacher_id: int, staff_type: str) -> None:
    """Mark which staff-management section owns this shared employee row."""
    directory_types = _get_staff_directory_types(cursor)
    directory_types[str(teacher_id)] = staff_type
    cursor.execute(
        """
        INSERT INTO school_settings (setting_key, setting_value)
        VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        """,
        ("staff_directory_types", json.dumps(directory_types)),
    )


@router.post("/teachers")
def add_teacher(teacher: Teacher):
    """Add a new teacher along with address and personal details."""
    try:
        with db_cursor(database="school_management", autocommit=False) as (cursor, conn):
            try:
                cursor.execute(
                    """
                    INSERT INTO teacher_details (
                        full_name, date_of_birth, gender, category, blood_group, phone, email
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        teacher.full_name,
                        teacher.date_of_birth,
                        teacher.gender,
                        teacher.category,
                        teacher.blood_group,
                        teacher.phone,
                        teacher.email,
                    ),
                )

                teacher_id = cursor.lastrowid

                cursor.execute(
                    """
                    INSERT INTO teacher_address (
                        teacher_id, house_no, street, city, state, pincode
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        teacher_id,
                        teacher.house_no,
                        teacher.street,
                        teacher.city,
                        teacher.state,
                        teacher.pincode,
                    ),
                )

                cursor.execute(
                    """
                    INSERT INTO teacher_personal_details (
                        teacher_id, date_of_joining, joining_no, aadhar_no, qualification, post, cl
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        teacher_id,
                        teacher.date_of_joining,
                        teacher.joining_no,
                        teacher.aadhar_no,
                        teacher.qualification,
                        teacher.post,
                        teacher.cl,
                    ),
                )

                # Salary reads this marker to keep all Teacher-section staff
                # separate from Non-Teaching Staff-section personnel.
                _set_staff_directory_type(cursor, teacher_id, "teaching")

                conn.commit()
                return {
                    "message": "Teacher added successfully",
                    "teacher_id": teacher_id,
                }
            except HTTPException:
                raise
            except Exception:
                
                logger.exception("An internal error occurred")
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database failure while adding teacher")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )


@router.get("/teachers")
def get_teachers():
    """Return a summarized list of all teachers (id, name, phone, post)."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cursor, _):
            try:
                cursor.execute(
                    """
                    SELECT
                        td.teacher_id,
                        td.full_name,
                        td.phone,
                        tpd.post
                    FROM teacher_details td
                    LEFT JOIN teacher_personal_details tpd
                        ON td.teacher_id = tpd.teacher_id
                    ORDER BY td.teacher_id
                    """
                )
                teachers = cursor.fetchall()
                directory_types = _get_staff_directory_types(cursor)
                # Do not show staff created in the Non-Teaching Staff section
                # in the teacher directory merely because both modules share
                # the same database tables.
                return [
                    teacher for teacher in teachers
                    if directory_types.get(str(teacher["teacher_id"])) != "non_teaching"
                ]
            except HTTPException:
                raise
            except Exception:
                logger.exception("An internal error occurred")
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database failure while retrieving teachers")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )


@router.get("/teachers/details")
def get_teacher_details(teacher_id: int = Query(...)):
    """Return full details for a single teacher by ID."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cursor, _):
            try:
                cursor.execute(
                    """
                    SELECT
                        td.teacher_id,
                        td.full_name,
                        td.date_of_birth,
                        td.gender,
                        td.category,
                        td.blood_group,
                        td.phone,
                        td.email,
                        ta.house_no,
                        ta.street,
                        ta.city,
                        ta.state,
                        ta.pincode,
                        tpd.date_of_joining,
                        tpd.joining_no,
                        tpd.aadhar_no,
                        tpd.qualification,
                        tpd.post,
                        tpd.cl
                    FROM teacher_details td
                    LEFT JOIN teacher_address ta
                        ON td.teacher_id = ta.teacher_id
                    LEFT JOIN teacher_personal_details tpd
                        ON td.teacher_id = tpd.teacher_id
                    WHERE td.teacher_id = %s
                    """,
                    (teacher_id,),
                )

                teacher = cursor.fetchone()
                if not teacher:
                    raise HTTPException(status_code=404, detail="Teacher not found")

                return teacher
            except HTTPException:
                raise
            except Exception:
                logger.exception(
                    "Unexpected error while retrieving teacher details for %s",
                    teacher_id,
                )
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Database connection failure while retrieving teacher details for %s",
            teacher_id,
        )
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )


@router.get("/teachers/{teacher_id}/academic")
def get_teacher_academic(teacher_id: int):
    """Return academic details, assigned classes, subjects, and timetable for a teacher."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cursor, _):
            try:
                cursor.execute(
                    """
                    SELECT
                        td.teacher_id,
                        td.full_name,
                        tpd.post,
                        tpd.qualification,
                        tpd.date_of_joining,
                        tpd.cl
                    FROM teacher_details td
                    LEFT JOIN teacher_personal_details tpd
                        ON td.teacher_id = tpd.teacher_id
                    WHERE td.teacher_id = %s
                    """,
                    (teacher_id,),
                )
                teacher = cursor.fetchone()
                if not teacher:
                    raise HTTPException(status_code=404, detail="Teacher not found")

                teacher_name = teacher.get("full_name") or ""

                cursor.execute(
                    """
                    SELECT
                        timetable_id,
                        class_name,
                        section,
                        day_of_week,
                        period_number,
                        subject,
                        start_time,
                        end_time
                    FROM timetable
                    WHERE teacher_name = %s
                    ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), period_number
                    """,
                    (teacher_name,),
                )
                slots = cursor.fetchall()
                for s in slots:
                    if hasattr(s.get("start_time"), "total_seconds"):
                        total_secs = int(s["start_time"].total_seconds())
                        s["start_time"] = f"{total_secs//3600:02d}:{(total_secs%3600)//60:02d}"
                    elif s.get("start_time"):
                        s["start_time"] = str(s["start_time"])

                    if hasattr(s.get("end_time"), "total_seconds"):
                        total_secs = int(s["end_time"].total_seconds())
                        s["end_time"] = f"{total_secs//3600:02d}:{(total_secs%3600)//60:02d}"
                    elif s.get("end_time"):
                        s["end_time"] = str(s["end_time"])

                class_map = {}
                for s in slots:
                    key = (str(s.get("class_name") or ""), str(s.get("section") or ""), str(s.get("subject") or ""))
                    if key not in class_map:
                        class_map[key] = {
                            "class_name": key[0],
                            "section": key[1],
                            "subject": key[2],
                            "periods_per_week": 0,
                            "role": "Subject Teacher",
                        }
                    class_map[key]["periods_per_week"] += 1

                assigned_classes = list(class_map.values())
                subjects = sorted(list({c["subject"] for c in assigned_classes if c["subject"]}))

                return {
                    "teacher_id": teacher["teacher_id"],
                    "full_name": teacher["full_name"],
                    "post": teacher.get("post") or "Faculty",
                    "qualification": teacher.get("qualification") or "-",
                    "date_of_joining": str(teacher.get("date_of_joining") or "-"),
                    "assigned_classes": assigned_classes,
                    "timetable": slots,
                    "total_periods": len(slots),
                    "subjects": subjects,
                }
            except HTTPException:
                raise
            except Exception:
                logger.exception("Unexpected error while retrieving academic details for %s", teacher_id)
                raise HTTPException(status_code=500, detail="An internal server error occurred.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database connection failure while retrieving academic details for %s", teacher_id)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.get("/teachers/{teacher_id}/salary")
def get_teacher_salary(teacher_id: int):
    """Salary structure, bank details and paid payslips of one staff member.

    The numbers come from the Salary module (Salary Structure and Payment Records).
    """
    try:
        with db_cursor(database="school_management", dictionary=True) as (cursor, _):
            return get_teacher_salary_view(cursor, teacher_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database failure while retrieving salary details for %s", teacher_id)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.put("/teachers/{teacher_id}")
def update_teacher(teacher_id: int, teacher: Teacher):
    """Update all fields for an existing teacher record."""
    try:
        with db_cursor(database="school_management", autocommit=False) as (cursor, conn):
            try:
                cursor.execute(
                    "SELECT teacher_id FROM teacher_details WHERE teacher_id = %s",
                    (teacher_id,),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=404, detail="Teacher not found")

                cursor.execute(
                    """
                    UPDATE teacher_details
                    SET
                        full_name = %s,
                        date_of_birth = %s,
                        gender = %s,
                        category = %s,
                        blood_group = %s,
                        phone = %s,
                        email = %s
                    WHERE teacher_id = %s
                    """,
                    (
                        teacher.full_name,
                        teacher.date_of_birth,
                        teacher.gender,
                        teacher.category,
                        teacher.blood_group,
                        teacher.phone,
                        teacher.email,
                        teacher_id,
                    ),
                )

                cursor.execute(
                    """
                    UPDATE teacher_address
                    SET
                        house_no = %s,
                        street = %s,
                        city = %s,
                        state = %s,
                        pincode = %s
                    WHERE teacher_id = %s
                    """,
                    (
                        teacher.house_no,
                        teacher.street,
                        teacher.city,
                        teacher.state,
                        teacher.pincode,
                        teacher_id,
                    ),
                )

                cursor.execute(
                    """
                    UPDATE teacher_personal_details
                    SET
                        date_of_joining = %s,
                        joining_no = %s,
                        aadhar_no = %s,
                        qualification = %s,
                        post = %s,
                        cl = %s
                    WHERE teacher_id = %s
                    """,
                    (
                        teacher.date_of_joining,
                        teacher.joining_no,
                        teacher.aadhar_no,
                        teacher.qualification,
                        teacher.post,
                        teacher.cl,
                        teacher_id,
                    ),
                )

                conn.commit()
                return {"message": "Teacher updated successfully"}

            except HTTPException:
                
                raise
            except Exception:

                logger.exception("An internal error occurred")
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database failure while updating teacher %s", teacher_id)
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )


@router.delete("/teachers/{teacher_id}")
def delete_teacher(teacher_id: int):
    """Permanently delete a teacher record by ID."""
    try:
        with db_cursor(database="school_management", autocommit=False) as (cursor, conn):
            try:
                cursor.execute(
                    "SELECT teacher_id FROM teacher_details WHERE teacher_id = %s",
                    (teacher_id,),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=404, detail="Teacher not found")

                cursor.execute(
                    "DELETE FROM teacher_details WHERE teacher_id = %s",
                    (teacher_id,),
                )
                conn.commit()
                return {"message": "Teacher deleted successfully"}

            except HTTPException:
                
                raise
            except Exception:
                
                logger.exception("An internal error occurred")
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database failure while deleting teacher %s", teacher_id)
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )
