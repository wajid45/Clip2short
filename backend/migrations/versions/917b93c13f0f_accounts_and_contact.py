"""password resets, contact messages, session version

Revision ID: 917b93c13f0f
Revises: 6cdf7e688820
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.db

revision: str = "917b93c13f0f"
down_revision: str | None = "6cdf7e688820"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("User") as batch:
        batch.add_column(sa.Column("sessionVersion", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "PasswordReset",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("userId", sa.String(), sa.ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False),
        sa.Column("tokenHash", sa.String(), nullable=False, unique=True),
        sa.Column("expiresAt", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("usedAt", app.db.UTCDateTime(timezone=True), nullable=True),
        sa.Column("createdAt", app.db.UTCDateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "ContactMessage",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("topic", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("userAgent", sa.String(), nullable=True),
        sa.Column("handled", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("createdAt", app.db.UTCDateTime(timezone=True), nullable=False),
    )
    op.create_index("ContactMessage_createdAt_idx", "ContactMessage", ["createdAt"])


def downgrade() -> None:
    op.drop_index("ContactMessage_createdAt_idx", table_name="ContactMessage")
    op.drop_table("ContactMessage")
    op.drop_table("PasswordReset")
    with op.batch_alter_table("User") as batch:
        batch.drop_column("sessionVersion")
