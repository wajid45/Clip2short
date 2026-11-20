"""optional two-factor sign-in for app users

Revision ID: e6a4b8c0d235
Revises: d5f3a7b9c124
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.db

revision: str = "e6a4b8c0d235"
down_revision: str | None = "d5f3a7b9c124"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "UserTwoFactor",
        sa.Column("userId", sa.String(), nullable=False),
        sa.Column("secretEnc", sa.String(), nullable=True),
        sa.Column("pendingSecretEnc", sa.String(), nullable=True),
        sa.Column("enabledAt", app.db.UTCDateTime(timezone=True), nullable=True),
        sa.Column("lastStep", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("recoveryHashes", sa.Text(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.PrimaryKeyConstraint("userId"),
    )


def downgrade() -> None:
    op.drop_table("UserTwoFactor")
