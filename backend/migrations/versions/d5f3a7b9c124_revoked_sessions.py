"""revoked app sessions (signing out ends the session on the server too)

Revision ID: d5f3a7b9c124
Revises: c4e2f6a8b013
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.db

revision: str = "d5f3a7b9c124"
down_revision: str | None = "c4e2f6a8b013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "RevokedSession",
        sa.Column("jti", sa.String(), nullable=False),
        sa.Column("expiresAt", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("jti"),
    )
    op.create_index("RevokedSession_expiresAt_idx", "RevokedSession", ["expiresAt"])


def downgrade() -> None:
    op.drop_index("RevokedSession_expiresAt_idx", table_name="RevokedSession")
    op.drop_table("RevokedSession")
