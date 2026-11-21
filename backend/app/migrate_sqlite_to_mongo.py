"""Copies the old SQLite database into MongoDB, one collection per table.

    uv run python -m app.migrate_sqlite_to_mongo                 # backend/data/dev.db -> MONGODB_URI
    uv run python -m app.migrate_sqlite_to_mongo path/to/db.sqlite --dry-run

Safe to run more than once: every row is upserted by its id, so re-running updates rather than
duplicates. SQLite stored times as integer milliseconds; they become real dates. Booleans stored
as 0/1 become true/false.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pymongo import ReplaceOne

from . import models  # noqa: F401 - registers every model
from .config import BACKEND_DIR
from .db import database
from .odm import MODELS, Model


def _kind(model: type[Model], field: str) -> str:
    hint = str(model.__annotations__.get(field, ""))
    if "datetime" in hint:
        return "datetime"
    if "bool" in hint:
        return "bool"
    return ""


def _convert(value: Any, kind: str) -> Any:
    if value is None:
        return None
    if kind == "datetime":
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / 1000, UTC)
        if isinstance(value, str):
            if value.isdigit():
                return datetime.fromtimestamp(int(value) / 1000, UTC)
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    if kind == "bool":
        return bool(value)
    return value


def migrate(path: Path, dry_run: bool = False) -> dict[str, int]:
    src = sqlite3.connect(path)
    src.row_factory = sqlite3.Row
    tables = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    db = None if dry_run else database()
    counts: dict[str, int] = {}
    for name, model in MODELS.items():
        if name != model.__tablename__ or name not in tables:
            continue
        kinds = {f: _kind(model, f) for f in model.__columns__}
        ops = []
        for row in src.execute(f'SELECT * FROM "{name}"'):
            data = dict(row)
            doc: dict[str, Any] = {"_id": data[model.__pk__]}
            for field, col in model.__columns__.items():
                if col.primary_key or field not in data:
                    continue
                v = _convert(data[field], kinds[field])
                if v is not None:
                    doc[field] = v
            ops.append(ReplaceOne({"_id": doc["_id"]}, doc, upsert=True))
        counts[name] = len(ops)
        if ops and db is not None:
            try:
                db[name].bulk_write(ops, ordered=False)
            except TypeError:  # in-memory test database: one at a time
                for op in ops:
                    db[name].replace_one(op._filter, op._doc, upsert=True)
    src.close()
    return counts


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("sqlite", nargs="?", default=str(BACKEND_DIR / "data" / "dev.db"))
    p.add_argument("--dry-run", action="store_true", help="read and count the rows without writing")
    a = p.parse_args()
    path = Path(a.sqlite)
    if not path.exists():
        sys.exit(f"No SQLite database at {path}")
    counts = migrate(path, a.dry_run)
    for name, n in counts.items():
        print(f"{name:20} {n:6} {'(dry run)' if a.dry_run else 'copied'}")
    print(f"Total: {sum(counts.values())} rows")


if __name__ == "__main__":
    main()
