"""
Teacher management router.
Handles listing, adding, viewing, updating, and deleting teacher records.
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from database import db_cursor
from models.teacher import Teacher

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Teachers"])


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
                return cursor.fetchall()
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
    """Return salary structure, allowances, deductions, bank details, and payslips for a teacher."""
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
                        tpd.joining_no,
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

                post = (teacher.get("post") or "").lower()
                if "principal" in post:
                    basic = 85000.0
                elif "vice" in post or "head" in post:
                    basic = 70000.0
                elif "pgt" in post or "senior" in post:
                    basic = 55000.0
                elif "tgt" in post or "secondary" in post:
                    basic = 45000.0
                elif "prt" in post or "primary" in post:
                    basic = 35000.0
                else:
                    basic = 42000.0

                hra = round(basic * 0.20, 2)
                da = round(basic * 0.15, 2)
                special_allowance = 3000.0
                gross_salary = round(basic + hra + da + special_allowance, 2)

                pf = round(basic * 0.12, 2)
                tax_tds = round(gross_salary * 0.05, 2)
                professional_tax = 200.0
                total_deductions = round(pf + tax_tds + professional_tax, 2)
                net_salary = round(gross_salary - total_deductions, 2)

                months = [
                    ("October 2026", "2026-10-31"),
                    ("September 2026", "2026-09-30"),
                    ("August 2026", "2026-08-31"),
                    ("July 2026", "2026-07-31"),
                    ("June 2026", "2026-06-30"),
                    ("May 2026", "2026-05-31"),
                ]

                payslips = []
                for idx, (m_label, p_date) in enumerate(months):
                    ref_suffix = (teacher_id * 1000 + idx * 37) % 90000 + 10000
                    payslips.append({
                        "month": m_label,
                        "payment_date": p_date,
                        "basic_pay": basic,
                        "allowances": round(hra + da + special_allowance, 2),
                        "gross_salary": gross_salary,
                        "deductions": total_deductions,
                        "net_pay": net_salary,
                        "payment_mode": "Bank Transfer (NEFT)",
                        "reference_no": f"SAL26{ref_suffix}",
                        "status": "Paid"
                    })

                account_masked = f"••••••••{(1000 + (teacher_id * 137) % 9000)}"
                pan_masked = f"ABCDE{(1000 + (teacher_id * 73) % 9000)}F"

                return {
                    "teacher_id": teacher["teacher_id"],
                    "full_name": teacher["full_name"],
                    "post": teacher.get("post") or "Faculty",
                    "structure": {
                        "basic_pay": basic,
                        "hra": hra,
                        "da": da,
                        "special_allowance": special_allowance,
                        "gross_salary": gross_salary,
                        "pf": pf,
                        "tax_tds": tax_tds,
                        "professional_tax": professional_tax,
                        "total_deductions": total_deductions,
                        "net_salary": net_salary,
                        "cl_balance": teacher.get("cl") if teacher.get("cl") is not None else 12,
                    },
                    "bank_details": {
                        "bank_name": "State Bank of India",
                        "account_number": account_masked,
                        "ifsc_code": "SBIN0001423",
                        "pan_number": pan_masked,
                        "payment_mode": "Direct Bank Transfer (NEFT)"
                    },
                    "payslips": payslips
                }
            except HTTPException:
                raise
            except Exception:
                logger.exception("Unexpected error while retrieving salary details for %s", teacher_id)
                raise HTTPException(status_code=500, detail="An internal server error occurred.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database connection failure while retrieving salary details for %s", teacher_id)
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
