from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Prefecture(Base):
    __tablename__ = "prefectures"

    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id"))
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(10), unique=True)

    region: Mapped["Region"] = relationship(back_populates="prefectures")
    offices: Mapped[list["Office"]] = relationship(back_populates="prefecture", lazy="selectin")
