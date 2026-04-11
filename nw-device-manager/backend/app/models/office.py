from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Office(Base):
    __tablename__ = "offices"

    id: Mapped[int] = mapped_column(primary_key=True)
    prefecture_id: Mapped[int] = mapped_column(ForeignKey("prefectures.id"))
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(20), unique=True)
    address: Mapped[str | None] = mapped_column(String(500))

    prefecture: Mapped["Prefecture"] = relationship(back_populates="offices")
    hosts: Mapped[list["Host"]] = relationship(back_populates="office", lazy="noload")
