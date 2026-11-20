"""admin portal: user suspension, admin authenticator, audit log

Revision ID: a3c1d5e7f902
Revises: 917b93c13f0f
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.db

revision: str = "a3c1d5e7f902"
down_revision: str | None = "917b93c13f0f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("User") as batch:
        batch.add_column(sa.Column("suspendedAt", app.db.UTCDateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("suspendedReason", sa.String(), nullable=True))

    op.create_table(
        "AdminTotp",
        sa.Column("userId", sa.String(), sa.ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True),
        sa.Column("secretEnc", sa.String(), nullable=True),
        sa.Column("pendingSecretEnc", sa.String(), nullable=True),
        sa.Column("enabledAt", app.db.UTCDateTime(timezone=True), nullable=True),
        sa.Column("lastStep", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sessionVersion", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updatedAt", app.db.UTCDateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "AdminAudit",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("adminId", sa.String(), sa.ForeignKey("User.id", ondelete="SET NULL", onupdate="CASCADE"), nullable=True),
        sa.Column("adminEmail", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("targetUserId", sa.String(), sa.ForeignKey("User.id", ondelete="SET NULL", onupdate="CASCADE"), nullable=True),
        sa.Column("detail", sa.String(), nullable=True),
        sa.Column("ip", sa.String(), nullable=True),
        sa.Column("createdAt", app.db.UTCDateTime(timezone=True), nullable=False),
    )
    op.create_index("AdminAudit_createdAt_idx", "AdminAudit", ["createdAt"])
    op.create_index("AdminAudit_targetUserId_createdAt_idx", "AdminAudit", ["targetUserId", "createdAt"])


def downgrade() -> None:
    op.drop_index("AdminAudit_targetUserId_createdAt_idx", table_name="AdminAudit")
    op.drop_index("AdminAudit_createdAt_idx", table_name="AdminAudit")
    op.drop_table("AdminAudit")
    op.drop_table("AdminTotp")
    with op.batch_alter_table("User") as batch:
        batch.drop_column("suspendedReason")
        batch.drop_column("suspendedAt")
