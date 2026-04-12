"""add email column to users table

Revision ID: 001_add_email
Revises:
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa

revision = "001_add_email"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "email")
