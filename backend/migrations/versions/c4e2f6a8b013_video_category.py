"""video category (chooses the AI engine) and the clip's moment label

Revision ID: c4e2f6a8b013
Revises: a3c1d5e7f902
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4e2f6a8b013"
down_revision: str | None = "a3c1d5e7f902"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("Video") as batch:
        batch.add_column(sa.Column("category", sa.String(), nullable=False, server_default="other"))
    with op.batch_alter_table("Clip") as batch:
        batch.add_column(sa.Column("momentLabel", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("Clip") as batch:
        batch.drop_column("momentLabel")
    with op.batch_alter_table("Video") as batch:
        batch.drop_column("category")
