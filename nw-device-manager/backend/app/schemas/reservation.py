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
