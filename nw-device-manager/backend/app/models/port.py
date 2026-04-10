import enum

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UsageStatus(str, enum.Enum):
    AVAILABLE = "available"
    IN_USE = "in_use"
    RESERVED = "reserved"
    FAULTY = "faulty"


class Port(Base):
    __tablename__ = "ports"

    id: Mapped[int] = mapped_column(primary_key=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("slots.id"))
    port_number: Mapped[str] = mapped_column(String(50))
    port_name: Mapped[str | None] = mapped_column(String(200))
    port_type: Mapped[str | None] = mapped_column(String(100))
    port_rate: Mapped[str | None] = mapped_column(String(100))
    layer_rate: Mapped[str | None] = mapped_column(String(100))
    admin_status: Mapped[str | None] = mapped_column(String(50))
    oper_status: Mapped[str | None] = mapped_column(String(50))
    usage_status: Mapped[UsageStatus] = mapped_column(Enum(UsageStatus), default=UsageStatus.AVAILABLE)
    description: Mapped[str | None] = mapped_column(String(500))
    sfp_info: Mapped[dict | None] = mapped_column(JSONB)

    slot: Mapped["Slot"] = relationship(back_populates="ports")
    reservations: Mapped[list["PortReservation"]] = relationship(back_populates="port", lazy="selectin")
