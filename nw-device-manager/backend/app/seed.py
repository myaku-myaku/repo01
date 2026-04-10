"""Create initial admin user if none exists."""
import asyncio

from sqlalchemy import select

from app.auth.jwt import get_password_hash
from app.database import async_session
from app.models.user import User, UserRole


async def seed_admin():
    async with async_session() as db:
        result = await db.execute(select(User).where(User.role == UserRole.ADMIN))
        if result.scalar_one_or_none() is not None:
            print("Admin user already exists, skipping seed.")
            return
        admin = User(
            username="admin",
            display_name="Administrator",
            hashed_password=get_password_hash("admin"),
            role=UserRole.ADMIN,
        )
        db.add(admin)
        await db.commit()
        print("Created admin user (username: admin, password: admin)")


if __name__ == "__main__":
    asyncio.run(seed_admin())
