import enum

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class HostStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"


class Host(Base):
    __tablename__ = "hosts"

    id: Mapped[int] = mapped_column(primary_key=True)
    office_id: Mapped[int] = mapped_column(ForeignKey("offices.id"))
    hostname: Mapped[str] = mapped_column(String(200), unique=True)
    model: Mapped[str | None] = mapped_column(String(200))
    vendor: Mapped[str | None] = mapped_column(String(100))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    software_version: Mapped[str | None] = mapped_column(String(100))
    ne_type: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[HostStatus] = mapped_column(Enum(HostStatus), default=HostStatus.ACTIVE)

    office: Mapped["Office"] = relationship(back_populates="hosts")
    slots: Mapped[list["Slot"]] = relationship(back_populates="host", lazy="selectin", cascade="all, delete-orphan")
