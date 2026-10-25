from models.safe import SafeFormModel
from typing import Optional
from datetime import date

class TransportVehicle(SafeFormModel):
    vehicle_number: str
    vehicle_type: str = "Bus"
    model_name: str
    capacity: int
    route_name: str
    fitness_expiry: Optional[date] = None
    status: str = "Active"

class TransportDriver(SafeFormModel):
    full_name: str
    phone: str
    license_number: str
    vehicle_id: Optional[int] = None
    status: str = "Active"

class TransportStudent(SafeFormModel):
    student_id: int
    route_name: str
    pickup_drop_stop: str
    vehicle_id: Optional[int] = None
    emergency_contact: Optional[str] = None
