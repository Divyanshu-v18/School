"""
School transport management router.
Handles vehicles, drivers, and student bus route enrollments.
"""

import logging
from fastapi import APIRouter, HTTPException
import mysql.connector

from database import db_cursor
from models.transport import (
    TransportVehicle,
    TransportDriver,
    TransportStudent,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Transport"])


# 1. Transport Vehicles
@router.get("/transport/vehicles")
def get_transport_vehicles():
    """Retrieve all transport vehicles along with assigned driver details."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute(
                """
                SELECT 
                    v.vehicle_id,
                    v.vehicle_number,
                    v.vehicle_type,
                    v.model_name,
                    v.capacity,
                    v.route_name,
                    v.fitness_expiry,
                    v.status,
                    d.driver_id,
                    d.full_name AS driver_name,
                    d.phone AS driver_phone
                FROM transport_vehicles v
                LEFT JOIN transport_drivers d ON v.vehicle_id = d.vehicle_id
                ORDER BY v.vehicle_id DESC
                """
            )
            rows = cur.fetchall()
            for r in rows:
                if r.get("fitness_expiry"):
                    r["fitness_expiry"] = str(r["fitness_expiry"])
            return rows
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/transport/vehicles")
def add_transport_vehicle(vehicle: TransportVehicle):
    """Add a new transport vehicle."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO transport_vehicles (
                    vehicle_number, vehicle_type, model_name, capacity, route_name, fitness_expiry, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    vehicle.vehicle_number.strip().upper(),
                    vehicle.vehicle_type,
                    vehicle.model_name.strip(),
                    vehicle.capacity,
                    vehicle.route_name.strip(),
                    vehicle.fitness_expiry,
                    vehicle.status,
                ),
            )
            return {"message": "Vehicle added successfully", "vehicle_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/transport/vehicles/{vehicle_id}")
def delete_transport_vehicle(vehicle_id: int):
    """Delete a transport vehicle by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM transport_vehicles WHERE vehicle_id = %s", (vehicle_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Vehicle not found")
            return {"message": "Vehicle deleted successfully"}
    
    except mysql.connector.IntegrityError as err:
        # MySQL 1451 means a referenced parent row cannot be deleted.
        if err.errno == 1451:
            logger.warning(
                "Cannot delete vehicle %s because it is referenced by another record",
                vehicle_id,
            )
            raise HTTPException(
                status_code=409,
                detail=(
                    "Cannot delete vehicle because drivers or students "
                    "are currently assigned to it."
                ),
            ) from err

        # Do not misclassify unrelated integrity errors as assignment conflicts.
        logger.exception(
            "Unexpected integrity error while deleting vehicle %s",
            vehicle_id,
        )
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        ) from err

    except HTTPException:
        raise

    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred.",
        )



# 2. Transport Drivers
@router.get("/transport/drivers")
def get_transport_drivers():
    """Retrieve all transport drivers along with their assigned vehicle info."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur, _):
            cur.execute(
                """
                SELECT 
                    d.driver_id,
                    d.full_name,
                    d.phone,
                    d.license_number,
                    d.vehicle_id,
                    d.status,
                    v.vehicle_number,
                    v.vehicle_type,
                    v.route_name
                FROM transport_drivers d
                LEFT JOIN transport_vehicles v ON d.vehicle_id = v.vehicle_id
                ORDER BY d.driver_id DESC
                """
            )
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/transport/drivers")
def add_transport_driver(driver: TransportDriver):
    """Add a new transport driver."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO transport_drivers (
                    full_name, phone, license_number, vehicle_id, status
                ) VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    driver.full_name.strip(),
                    driver.phone.strip(),
                    driver.license_number.strip().upper(),
                    driver.vehicle_id if driver.vehicle_id else None,
                    driver.status,
                ),
            )
            return {"message": "Driver added successfully", "driver_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/transport/drivers/{driver_id}")
def delete_transport_driver(driver_id: int):
    """Delete a transport driver by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM transport_drivers WHERE driver_id = %s", (driver_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Driver not found")
            return {"message": "Driver deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


# 3. Transport Student Enrollments
@router.get("/transport/students")
def get_transport_students():
    """Retrieve all student transport enrollments joined with student details."""
    try:
        with db_cursor(database="school_management", dictionary=True) as (cur_admin, _):
            cur_admin.execute(
                """
                SELECT 
                    ts.enrollment_id,
                    ts.student_id,
                    ts.route_name,
                    ts.pickup_drop_stop,
                    ts.vehicle_id,
                    ts.emergency_contact,
                    ts.created_at,
                    v.vehicle_number,
                    v.vehicle_type
                FROM transport_students ts
                LEFT JOIN transport_vehicles v ON ts.vehicle_id = v.vehicle_id
                ORDER BY ts.enrollment_id DESC
                """
            )
            enrollments = cur_admin.fetchall()

        if not enrollments:
            return []

        # Fetch student details from student database
        student_ids = [e["student_id"] for e in enrollments]
        format_strings = ",".join(["%s"] * len(student_ids))

        with db_cursor(database="school_management", dictionary=True) as (cur_student, _):
            cur_student.execute(
                f"""
                SELECT 
                    sd.student_id,
                    sd.full_name,
                    spd.class,
                    spd.section,
                    spd.admission_no,
                    sp.father_phone,
                    sp.mother_phone
                FROM student_details sd
                LEFT JOIN student_personal_details spd ON sd.student_id = spd.student_id
                LEFT JOIN student_parent_details sp ON sd.student_id = sp.student_id
                WHERE sd.student_id IN ({format_strings})
                """,
                tuple(student_ids),
            )
            students_info = {s["student_id"]: s for s in cur_student.fetchall()}

        results = []
        for e in enrollments:
            s_info = students_info.get(e["student_id"], {})
            results.append(
                {
                    "enrollment_id": e["enrollment_id"],
                    "student_id": e["student_id"],
                    "full_name": s_info.get("full_name") or f"Student #{e['student_id']}",
                    "class": s_info.get("class") or "-",
                    "section": s_info.get("section") or "",
                    "admission_no": s_info.get("admission_no") or "",
                    "route_name": e["route_name"],
                    "pickup_drop_stop": e["pickup_drop_stop"],
                    "vehicle_id": e["vehicle_id"],
                    "vehicle_number": e["vehicle_number"] or "Unassigned",
                    "vehicle_type": e["vehicle_type"] or "",
                    "emergency_contact": (
                        e["emergency_contact"]
                        or s_info.get("father_phone")
                        or s_info.get("mother_phone")
                        or "-"
                    ),
                }
            )
        return results
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.post("/transport/students")
def enroll_transport_student(enrollment: TransportStudent):
    """Enroll a student in school transport."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute(
                """
                INSERT INTO transport_students (
                    student_id, route_name, pickup_drop_stop, vehicle_id, emergency_contact
                ) VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    route_name = VALUES(route_name),
                    pickup_drop_stop = VALUES(pickup_drop_stop),
                    vehicle_id = VALUES(vehicle_id),
                    emergency_contact = VALUES(emergency_contact)
                """,
                (
                    enrollment.student_id,
                    enrollment.route_name.strip(),
                    enrollment.pickup_drop_stop.strip(),
                    enrollment.vehicle_id if enrollment.vehicle_id else None,
                    enrollment.emergency_contact.strip() if enrollment.emergency_contact else None,
                ),
            )
            return {"message": "Student transport enrollment saved successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )


@router.delete("/transport/students/{enrollment_id}")
def delete_transport_student(enrollment_id: int):
    """Remove a student transport enrollment by ID."""
    try:
        with db_cursor(database="school_management") as (cur, _):
            cur.execute("DELETE FROM transport_students WHERE enrollment_id = %s", (enrollment_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Student transport enrollment not found")
            return {"message": "Student transport enrollment removed successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("An internal error occurred")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
