"""Initialize database tables and create initial admin user."""
import asyncio
import os

from sqlalchemy import select

from app.auth.jwt import get_password_hash
from app.database import Base, engine, async_session
from app.models import *  # noqa: F401,F403
from app.models.user import User, UserRole
from app.seed_locations import seed_locations


async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created.")

    async with async_session() as db:
        result = await db.execute(select(User).where(User.role == UserRole.ADMIN))
        if result.scalar_one_or_none() is None:
            admin = User(
                username="admin",
                display_name="Administrator",
                hashed_password=get_password_hash("admin"),
                role=UserRole.ADMIN,
            )
            db.add(admin)
            await db.commit()
            print("Created admin user (username: admin, password: admin)")
        else:
            print("Admin user already exists.")

    # Seed locations if CSV is available
    csv_path = os.environ.get("CSV_PATH", "/data/kyoten.csv")
    if os.path.exists(csv_path):
        await seed_locations(csv_path)
    else:
        print(f"Location CSV not found at {csv_path}, skipping location seed.")


if __name__ == "__main__":
    asyncio.run(init())
