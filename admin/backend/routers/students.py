"""
Student management router.
Handles listing, adding, viewing, updating, and deleting student records
across the student_details, student_personal_details, student_parent_details,
and student_address tables in the school_management database.
"""

from fastapi import APIRouter, HTTPException, Query
from database import db_cursor
from models.student import Student

import logging
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Students"])


@router.post("/students")
def add_student(student: Student):
    """Create a new student record with all related detail tables."""
    try:
        with db_cursor(database="school_management", autocommit=False) as (cursor, conn):
            try:
                cursor.execute(
                    """
                    INSERT INTO student_details (
                        full_name, date_of_birth, gender, category, blood_group
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        student.full_name,
                        student.date_of_birth,
                        student.gender,
                        student.category,
                        student.blood_group,
                    ),
                )

                student_id = cursor.lastrowid

                cursor.execute(
                    """
                    INSERT INTO student_personal_details (
                        student_id, admission_date, admission_no, aadhar_no_last_four,
                        apaar_no, pen_no, bpl, class, section
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        student_id,
                        student.admission_date,
                        student.admission_no,
                        student.aadhar_no_last_four,
                        student.apaar_no,
                        student.pen_no,
                        student.bpl,
                        student.class_name,
                        student.section,
                    ),
                )

                cursor.execute(
                    """
                    INSERT INTO student_parent_details (
                        student_id,
                        father_name, father_aadhar_last_four, father_phone,
                        mother_name, mother_aadhar_last_four, mother_phone
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        student_id,
                        student.father_name,
                        student.father_aadhar_last_four,
                        student.father_phone,
                        student.mother_name,
                        student.mother_aadhar_last_four,
                        student.mother_phone,
                    ),
                )

                cursor.execute(
                    """
                    INSERT INTO student_address (
                        address_id, student_id, house_no, pincode, street, city, state
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        student_id,
                        student_id,
                        student.house_no,
                        student.pincode,
                        student.street,
                        student.city,
                        student.state,
                    ),
                )

                conn.commit()
                return {
                    "message": "Student added successfully",
                    "student_id": student_id,
                }

            except Exception:
                logger.exception("Unexpected error while adding a student")
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database operation failed in add_student")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )



@router.get("/students")
def get_students():
    """Return a summarized list of all students (id, name, class, section)."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cursor, _):
            try:
                cursor.execute(
                    """
                    SELECT
                        sd.student_id,
                        sd.full_name,
                        spd.class,
                        spd.section
                    FROM student_details sd
                    LEFT JOIN student_personal_details spd
                        ON sd.student_id = spd.student_id
                    ORDER BY sd.student_id
                    """
                )
                return cursor.fetchall()
            except Exception:
                logger.exception("Unexpected error while retrieving students")
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database operation failed in get_students")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )



@router.get("/students/details")
def get_student_details(student_id: int = Query(...)):
    """Return full details for a single student by ID."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cursor, _):
            try:
                cursor.execute(
                    """
                    SELECT
                        sd.student_id,
                        sd.full_name,
                        sd.date_of_birth,
                        sd.gender,
                        sd.category,
                        sd.blood_group,

                        spd.admission_date,
                        spd.admission_no,
                        spd.aadhar_no_last_four,
                        spd.apaar_no,
                        spd.pen_no,
                        spd.bpl,
                        spd.class,
                        spd.section,

                        sp.father_name,
                        sp.father_aadhar_last_four,
                        sp.father_phone,
                        sp.mother_name,
                        sp.mother_aadhar_last_four,
                        sp.mother_phone,

                        sa.house_no,
                        sa.pincode,
                        sa.street,
                        sa.city,
                        sa.state

                    FROM student_details sd
                    LEFT JOIN student_personal_details spd
                        ON sd.student_id = spd.student_id
                    LEFT JOIN student_parent_details sp
                        ON sd.student_id = sp.student_id
                    LEFT JOIN student_address sa
                        ON sd.student_id = sa.student_id
                    WHERE sd.student_id = %s
                    """,
                    (student_id,),
                )

                student = cursor.fetchone()
                if not student:
                    raise HTTPException(status_code=404, detail="Student not found")

                return student
            except HTTPException:
                raise
            except Exception:
                logger.exception("Unexpected error while retrieving student details for %s", student_id)
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database operation failed in get_student_details")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )



@router.put("/students/{student_id}")
def update_student(student_id: int, student: Student):
    """Update all fields for an existing student record."""
    try:
        with db_cursor(database="school_management", autocommit=False) as (cursor, conn):
            try:
                cursor.execute(
                    "SELECT student_id FROM student_details WHERE student_id = %s",
                    (student_id,),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=404, detail="Student not found")

                cursor.execute(
                    """
                    UPDATE student_details
                    SET
                        full_name = %s,
                        date_of_birth = %s,
                        gender = %s,
                        category = %s,
                        blood_group = %s
                    WHERE student_id = %s
                    """,
                    (
                        student.full_name,
                        student.date_of_birth,
                        student.gender,
                        student.category,
                        student.blood_group,
                        student_id,
                    ),
                )

                cursor.execute(
                    """
                    UPDATE student_personal_details
                    SET
                        admission_date = %s,
                        admission_no = %s,
                        aadhar_no_last_four = %s,
                        apaar_no = %s,
                        pen_no = %s,
                        bpl = %s,
                        class = %s,
                        section = %s
                    WHERE student_id = %s
                    """,
                    (
                        student.admission_date,
                        student.admission_no,
                        student.aadhar_no_last_four,
                        student.apaar_no,
                        student.pen_no,
                        student.bpl,
                        student.class_name,
                        student.section,
                        student_id,
                    ),
                )

                cursor.execute(
                    """
                    UPDATE student_parent_details
                    SET
                        father_name = %s,
                        father_aadhar_last_four = %s,
                        father_phone = %s,
                        mother_name = %s,
                        mother_aadhar_last_four = %s,
                        mother_phone = %s
                    WHERE student_id = %s
                    """,
                    (
                        student.father_name,
                        student.father_aadhar_last_four,
                        student.father_phone,
                        student.mother_name,
                        student.mother_aadhar_last_four,
                        student.mother_phone,
                        student_id,
                    ),
                )

                cursor.execute(
                    """
                    UPDATE student_address
                    SET
                        house_no = %s,
                        pincode = %s,
                        street = %s,
                        city = %s,
                        state = %s
                    WHERE student_id = %s
                    """,
                    (
                        student.house_no,
                        student.pincode,
                        student.street,
                        student.city,
                        student.state,
                        student_id,
                    ),
                )

                conn.commit()
                return {"message": "Student updated successfully"}

            except HTTPException:
                raise
            except Exception:
                logger.exception("Unexpected error while updating student %s", student_id)
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database operation failed in update_student")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )



@router.delete("/students/{student_id}")
def delete_student(student_id: int):
    """Permanently delete a student record by ID."""
    try:
        with db_cursor(database="school_management", autocommit=False) as (cursor, conn):
            try:
                cursor.execute(
                    "SELECT student_id FROM student_details WHERE student_id = %s",
                    (student_id,),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=404, detail="Student not found")

                cursor.execute(
                    "DELETE FROM student_details WHERE student_id = %s",
                    (student_id,),
                )
                conn.commit()
                return {"message": "Student deleted successfully"}

            except HTTPException:
                raise
            except Exception:
                logger.exception("Unexpected error while deleting student %s", student_id)
                raise HTTPException(
                    status_code=500,
                    detail="An internal server error occurred.",
                )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Database operation failed in delete_student")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )
