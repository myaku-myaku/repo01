import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ReservationStatus(str, enum.Enum):
    ACTIVE = "active"
    RELEASED = "released"
    EXPIRED = "expired"


class PortReservation(Base):
    __tablename__ = "port_reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    port_id: Mapped[int] = mapped_column(ForeignKey("ports.id"))
    reserved_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reserved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purpose: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[ReservationStatus] = mapped_column(Enum(ReservationStatus), default=ReservationStatus.ACTIVE)

    port: Mapped["Port"] = relationship(back_populates="reservations")
    user: Mapped["User"] = relationship(back_populates="reservations")
