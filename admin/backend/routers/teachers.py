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
