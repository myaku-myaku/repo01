import enum

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SlotStatus(str, enum.Enum):
    EMPTY = "empty"
    INSTALLED = "installed"
    FAULTY = "faulty"


class Slot(Base):
    __tablename__ = "slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id"))
    slot_number: Mapped[str] = mapped_column(String(50))
    board_name: Mapped[str | None] = mapped_column(String(200))
    board_type: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[SlotStatus] = mapped_column(Enum(SlotStatus), default=SlotStatus.EMPTY)

    host: Mapped["Host"] = relationship(back_populates="slots")
    ports: Mapped[list["Port"]] = relationship(back_populates="slot", lazy="noload", cascade="all, delete-orphan")
