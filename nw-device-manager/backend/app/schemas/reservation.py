from datetime import datetime

from pydantic import BaseModel

from app.models.reservation import ReservationStatus


class ReservationCreate(BaseModel):
    purpose: str | None = None
    expires_at: datetime | None = None


class ReservationResponse(BaseModel):
    id: int
    port_id: int
    reserved_by: int
    reserved_by_name: str | None = None
    reserved_at: datetime
    expires_at: datetime | None
    purpose: str | None
    status: ReservationStatus

    model_config = {"from_attributes": True}


class ReservationListItem(BaseModel):
    id: int
    port_id: int
    reserved_by: int
    reserved_by_name: str | None = None
    reserved_at: datetime
    expires_at: datetime | None
    purpose: str | None
    status: ReservationStatus
    hostname: str
    host_id: int
    office_name: str
    office_id: int
    prefecture_name: str
    prefecture_id: int
    region_id: int
    slot_number: str
    port_number: str
    port_type: str | None
    port_rate: str | None
