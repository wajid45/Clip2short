"""A small object-document mapper over MongoDB (pymongo).

It mirrors the slice of the SQLAlchemy API this codebase was written against, so the routes read
the same: `select(Model).where(Model.field == x).order_by(Model.createdAt.desc())`, `s.get`, `s.add`,
`s.commit()`, `update(Model).where(...).values(...)`, `func.count()` and friends. Each model is a
collection; the primary key is stored as `_id`.

Semantics worth knowing:
- Keys whose value is None are not stored (they are `$unset`), so `field == None` matches them and
  sparse unique indexes behave like SQL unique columns (many NULLs allowed).
- `!=` follows SQL: rows where the field is NULL do not match.
- `like` / `contains` / `startswith` are case-insensitive, as SQLite's LIKE was.
- Foreign keys are declared on columns so deletes cascade (or set NULL) like the SQL schema did.
- `commit()` writes each change as it goes; MongoDB has no cross-document transaction here, so
  `rollback()` only forgets pending changes that were not written yet.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Iterator
from datetime import UTC, datetime
from typing import Any

from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

try:  # mongomock raises its own subclass in tests
    from mongomock import DuplicateKeyError as _MockDuplicate  # type: ignore[import-untyped]
except Exception:  # pragma: no cover
    _MockDuplicate = DuplicateKeyError

_DUPLICATE = (DuplicateKeyError, _MockDuplicate)


class IntegrityError(Exception):
    """A unique key was already taken (the SQL IntegrityError the code used to catch)."""


class NoResultFound(Exception):
    pass


class MultipleResultsFound(Exception):
    pass


# ── Expressions ────────────────────────────────────────────────────────────────


class Expr:
    """Something that can appear in a select list, a comparison or an ORDER BY."""

    __hash__ = object.__hash__

    def __eq__(self, other: Any) -> Cond:  # type: ignore[override]
        return Cmp(self, "eq", other)

    def __ne__(self, other: Any) -> Cond:  # type: ignore[override]
        return Cmp(self, "ne", other)

    def __lt__(self, other: Any) -> Cond:
        return Cmp(self, "lt", other)

    def __le__(self, other: Any) -> Cond:
        return Cmp(self, "lte", other)

    def __gt__(self, other: Any) -> Cond:
        return Cmp(self, "gt", other)

    def __ge__(self, other: Any) -> Cond:
        return Cmp(self, "gte", other)

    def __add__(self, n: Any) -> Arith:
        return Arith(self, n)

    def __sub__(self, n: Any) -> Arith:
        return Arith(self, -n)

    def in_(self, values: Iterable[Any]) -> Cond:
        return Cmp(self, "in", list(values))

    def not_in(self, values: Iterable[Any]) -> Cond:
        return Cmp(self, "nin", list(values))

    def is_(self, value: Any) -> Cond:
        return Cmp(self, "eq", value)

    def is_not(self, value: Any) -> Cond:
        return Cmp(self, "ne_any", value)

    isnot = is_not

    def like(self, pattern: str) -> Cond:
        return Cmp(self, "regex", _like_regex(pattern))

    ilike = like

    def contains(self, text: str) -> Cond:
        return Cmp(self, "regex", re.compile(re.escape(text), re.I))

    def startswith(self, text: str) -> Cond:
        return Cmp(self, "regex", re.compile("^" + re.escape(text), re.I))

    def desc(self) -> Order:
        return Order(self, DESCENDING)

    def asc(self) -> Order:
        return Order(self, ASCENDING)

    def label(self, name: str) -> Label:
        return Label(self, name)


def _like_regex(pattern: str) -> re.Pattern[str]:
    out = "".join(".*" if ch == "%" else "." if ch == "_" else re.escape(ch) for ch in pattern)
    return re.compile(f"^{out}$", re.I | re.S)


class Arith:
    """`Model.field + n`: used in update values (becomes `$inc`)."""

    def __init__(self, field: Expr, delta: Any):
        self.field, self.delta = field, delta


class Order:
    def __init__(self, expr: Expr, direction: int):
        self.expr, self.direction = expr, direction


class Label(Expr):
    def __init__(self, expr: Expr, name: str):
        self.expr, self.name = expr, name


class FuncExpr(Expr):
    def __init__(self, name: str, args: tuple[Any, ...]):
        self.name, self.args = name, args

    @property
    def is_aggregate(self) -> bool:
        return self.name in ("count", "sum", "max", "min", "avg") or (self.name == "coalesce" and isinstance(self.args[0], FuncExpr) and self.args[0].is_aggregate)


class _Func:
    def __getattr__(self, name: str) -> Callable[..., FuncExpr]:
        return lambda *args: FuncExpr(name, args)


func = _Func()


class Cond:
    def __and__(self, other: Cond) -> Cond:
        return And([self, other])

    def __or__(self, other: Cond) -> Cond:
        return Or([self, other])

    def __invert__(self) -> Cond:
        return Not(self)

    def __bool__(self) -> bool:  # `Column == x` must never be used as a plain bool by accident
        raise TypeError("A query condition has no truth value.")


class Cmp(Cond):
    def __init__(self, left: Expr, op: str, right: Any):
        self.left, self.op, self.right = left, op, right


class And(Cond):
    def __init__(self, conds: list[Cond]):
        self.conds = conds


class Or(Cond):
    def __init__(self, conds: list[Cond]):
        self.conds = conds


class Not(Cond):
    def __init__(self, cond: Cond):
        self.cond = cond


class Raw(Cond):
    """A ready-made Mongo filter, for hand-written queries."""

    def __init__(self, filter: dict[str, Any]):
        self.filter = filter


def and_(*conds: Cond) -> Cond:
    return And(list(conds))


def or_(*conds: Cond) -> Cond:
    return Or(list(conds))


def not_(cond: Cond) -> Cond:
    return Not(cond)


def _key(expr: Expr) -> str:
    if isinstance(expr, Column):
        return "_id" if expr.primary_key else expr.name
    if isinstance(expr, Label):
        return _key(expr.expr)
    raise TypeError(f"Can't use {expr!r} as a document field.")


def _value(v: Any) -> Any:
    if isinstance(v, Expr):
        raise TypeError("Comparing two columns needs a hand-written query.")
    if isinstance(v, (set, tuple)):
        return list(v)
    return v


def to_filter(cond: Cond | None) -> dict[str, Any]:
    if cond is None:
        return {}
    if isinstance(cond, Raw):
        return cond.filter
    if isinstance(cond, And):
        parts = [to_filter(c) for c in cond.conds]
        parts = [p for p in parts if p]
        return {} if not parts else parts[0] if len(parts) == 1 else {"$and": parts}
    if isinstance(cond, Or):
        return {"$or": [to_filter(c) for c in cond.conds]}
    if isinstance(cond, Not):
        return {"$nor": [to_filter(cond.cond)]}
    assert isinstance(cond, Cmp)
    left, op, right = cond.left, cond.op, cond.right
    if isinstance(left, FuncExpr) and left.name == "lower":
        # lower(field) compared with a value: a case-insensitive match on the field itself.
        key = _key(left.args[0])
        if op == "eq":
            return {key: re.compile("^" + re.escape(str(right)) + "$", re.I)}
        if op == "in":
            return {key: {"$in": [re.compile("^" + re.escape(str(v)) + "$", re.I) for v in right]}}
        if op == "regex":
            return {key: right}
        raise TypeError(f"lower() with {op} isn't supported.")
    key = _key(left)
    right = _value(right)
    if op == "eq":
        return {key: right}
    if op == "ne":
        return {key: {"$ne": None}} if right is None else {key: {"$nin": [right, None]}}  # SQL: NULL never matches !=
    if op == "ne_any":
        return {key: {"$ne": right}}
    if op == "regex":
        return {key: right}
    if op == "in":
        return {key: {"$in": right}}
    if op == "nin":
        return {key: {"$nin": right}}
    return {key: {f"${op}": right}}


# ── Models ─────────────────────────────────────────────────────────────────────


class Column(Expr):
    """A model field. On the class it is a query expression; on an instance, its value."""

    def __init__(
        self,
        *,
        primary_key: bool = False,
        default: Any = None,
        onupdate: Callable[[], Any] | None = None,
        unique: bool = False,
        index: bool = False,
        fk: tuple[str, str] | None = None,  # (target table, "CASCADE" | "SET NULL")
    ):
        self.primary_key, self.default, self.onupdate = primary_key, default, onupdate
        self.unique, self.index, self.fk = unique, index, fk
        self.name = ""
        self.model: type[Model] | None = None

    def __set_name__(self, owner: type, name: str) -> None:
        self.name = name
        self.model = owner  # type: ignore[assignment]

    def __get__(self, obj: Any, owner: type | None = None) -> Any:
        if obj is None:
            return self
        return obj.__dict__.get(self.name)

    def __set__(self, obj: Any, value: Any) -> None:
        obj.__dict__[self.name] = value

    def __repr__(self) -> str:
        return f"{self.model.__name__ if self.model else '?'}.{self.name}"


class relationship:  # noqa: N801 - mirrors sqlalchemy.orm.relationship
    """A lazy link to another model, loaded through the instance's session.

    many=False: `local` holds the target's primary key (Clip.video via Clip.videoId).
    many=True: the target's `remote` field points back at this instance (Video.clips via Clip.videoId)."""

    def __init__(self, target: str, *, local: str = "id", remote: str = "id", many: bool = False, order_by: str | None = None):
        self.target, self.local, self.remote, self.many, self.order_by = target, local, remote, many, order_by
        self.name = ""

    def __set_name__(self, owner: type, name: str) -> None:
        self.name = name

    def __get__(self, obj: Any, owner: type | None = None) -> Any:
        if obj is None:
            return self
        session: Session | None = obj.__dict__.get("_session")
        target = MODELS[self.target]
        if session is None:
            session = Session()
            obj.__dict__["_session"] = session
        if self.many:
            q = select(target).where(getattr(target, self.remote) == getattr(obj, self.local))
            if self.order_by:
                q = q.order_by(getattr(target, self.order_by))
            return session.scalars(q).all()
        key = getattr(obj, self.local)
        return None if key is None else session.get(target, key)

    def __set__(self, obj: Any, value: Any) -> None:
        if self.many:
            raise AttributeError(f"{self.name} is read-only")
        setattr(obj, self.local, None if value is None else value.id)
        if value is not None and "_session" not in obj.__dict__ and "_session" in value.__dict__:
            obj.__dict__["_session"] = value.__dict__["_session"]


MODELS: dict[str, type[Model]] = {}


class Index:
    def __init__(self, name: str, *fields: str, unique: bool = False):
        self.name, self.fields, self.unique = name, fields, unique


def UniqueConstraint(*fields: str, name: str) -> Index:  # noqa: N802 - mirrors the SQL name
    return Index(name, *fields, unique=True)


class Model:
    __tablename__: str = ""
    __table_args__: tuple[Index, ...] = ()
    __columns__: dict[str, Column] = {}
    __pk__: str = "id"

    def __init_subclass__(cls, **kw: Any) -> None:
        super().__init_subclass__(**kw)
        cols: dict[str, Column] = {}
        for klass in reversed(cls.__mro__):
            for k, v in vars(klass).items():
                if isinstance(v, Column):
                    cols[k] = v
        cls.__columns__ = cols
        cls.__pk__ = next(k for k, c in cols.items() if c.primary_key)
        if cls.__tablename__:
            MODELS[cls.__tablename__] = cls
            MODELS[cls.__name__] = cls

    def __init__(self, **values: Any) -> None:
        for name, col in self.__columns__.items():
            d = col.default
            self.__dict__[name] = d() if callable(d) else d
        for k, v in values.items():
            if k not in self.__columns__ and not isinstance(getattr(type(self), k, None), relationship):
                raise TypeError(f"{type(self).__name__} has no field {k!r}")
            setattr(self, k, v)

    @property
    def _pk_value(self) -> Any:
        return self.__dict__.get(self.__pk__)

    def __repr__(self) -> str:
        return f"<{type(self).__name__} {self._pk_value}>"


def to_doc(obj: Model) -> dict[str, Any]:
    doc: dict[str, Any] = {"_id": obj._pk_value}
    for name, col in obj.__columns__.items():
        if col.primary_key:
            continue
        v = obj.__dict__.get(name)
        if v is not None:
            doc[name] = v
    return doc


def _from_mongo(v: Any) -> Any:
    if isinstance(v, datetime) and v.tzinfo is None:
        return v.replace(tzinfo=UTC)
    return v


def _snapshot(obj: Model) -> dict[str, Any]:
    return {k: obj.__dict__.get(k) for k in obj.__columns__}


# ── Statements ─────────────────────────────────────────────────────────────────


class Select:
    def __init__(self, *entities: Any):
        self.entities = list(entities)
        self.wheres: list[Cond] = []
        self.orders: list[Any] = []
        self.groups: list[Expr] = []
        self._offset = 0
        self._limit: int | None = None
        self._from: type[Model] | None = None

    def _copy(self) -> Select:
        c = Select(*self.entities)
        c.wheres, c.orders, c.groups = list(self.wheres), list(self.orders), list(self.groups)
        c._offset, c._limit, c._from = self._offset, self._limit, self._from
        return c

    def where(self, *conds: Cond) -> Select:
        c = self._copy()
        c.wheres.extend(x for x in conds if x is not None)
        return c

    filter = where

    def order_by(self, *orders: Any) -> Select:
        c = self._copy()
        c.orders.extend(orders)
        return c

    def group_by(self, *exprs: Expr) -> Select:
        c = self._copy()
        c.groups.extend(exprs)
        return c

    def offset(self, n: int | None) -> Select:
        c = self._copy()
        c._offset = int(n or 0)
        return c

    def limit(self, n: int | None) -> Select:
        c = self._copy()
        c._limit = None if n is None else int(n)
        return c

    def select_from(self, model: type[Model]) -> Select:
        c = self._copy()
        c._from = model
        return c

    def options(self, *_: Any) -> Select:
        return self

    def with_only_columns(self, *entities: Any) -> Select:
        c = self._copy()
        c.entities = list(entities)
        return c

    @property
    def filter_doc(self) -> dict[str, Any]:
        return to_filter(And(self.wheres)) if self.wheres else {}

    def model(self) -> type[Model]:
        if self._from is not None:
            return self._from
        for e in self.entities:
            m = _model_of(e)
            if m is not None:
                return m
        raise TypeError("Can't tell which collection this query reads; add .select_from(Model).")


def _model_of(e: Any) -> type[Model] | None:
    if isinstance(e, type) and issubclass(e, Model):
        return e
    if isinstance(e, Column):
        return e.model
    if isinstance(e, Label):
        return _model_of(e.expr)
    if isinstance(e, FuncExpr):
        for a in e.args:
            m = _model_of(a)
            if m is not None:
                return m
    return None


def select(*entities: Any) -> Select:
    return Select(*entities)


class Update:
    def __init__(self, model: type[Model]):
        self.model_cls, self.wheres, self.vals = model, [], {}

    def where(self, *conds: Cond) -> Update:
        self.wheres.extend(conds)
        return self

    def values(self, **vals: Any) -> Update:
        self.vals.update(vals)
        return self


class Delete:
    def __init__(self, model: type[Model]):
        self.model_cls, self.wheres = model, []

    def where(self, *conds: Cond) -> Delete:
        self.wheres.extend(conds)
        return self


def update(model: type[Model]) -> Update:
    return Update(model)


def delete(model: type[Model]) -> Delete:
    return Delete(model)


# ── Results ────────────────────────────────────────────────────────────────────


class Row(tuple):
    _keys: tuple[str, ...] = ()

    def __new__(cls, values: Iterable[Any], keys: Iterable[str]) -> Row:
        r = super().__new__(cls, values)
        r._keys = tuple(keys)
        return r

    def __getattr__(self, name: str) -> Any:
        try:
            return self[self._keys.index(name)]
        except ValueError:
            raise AttributeError(name) from None

    @property
    def _mapping(self) -> dict[str, Any]:
        return dict(zip(self._keys, self, strict=False))


class ScalarResult:
    def __init__(self, items: list[Any]):
        self._items = items

    def all(self) -> list[Any]:
        return list(self._items)

    def first(self) -> Any:
        return self._items[0] if self._items else None

    def one(self) -> Any:
        if len(self._items) != 1:
            raise NoResultFound() if not self._items else MultipleResultsFound()
        return self._items[0]

    def one_or_none(self) -> Any:
        if len(self._items) > 1:
            raise MultipleResultsFound()
        return self._items[0] if self._items else None

    def unique(self) -> ScalarResult:
        seen, out = set(), []
        for x in self._items:
            k = id(x) if isinstance(x, Model) else x
            if k not in seen:
                seen.add(k)
                out.append(x)
        return ScalarResult(out)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._items)

    def __len__(self) -> int:
        return len(self._items)


class Result:
    def __init__(self, rows: list[Row] | None = None, rowcount: int = 0):
        self._rows = rows or []
        self.rowcount = rowcount

    def all(self) -> list[Row]:
        return list(self._rows)

    fetchall = all

    def first(self) -> Row | None:
        return self._rows[0] if self._rows else None

    def one(self) -> Row:
        return ScalarResult(self._rows).one()

    def one_or_none(self) -> Row | None:
        return ScalarResult(self._rows).one_or_none()

    def scalars(self) -> ScalarResult:
        return ScalarResult([r[0] for r in self._rows])

    def scalar(self) -> Any:
        return self._rows[0][0] if self._rows else None

    def scalar_one(self) -> Any:
        return self.scalars().one()

    def scalar_one_or_none(self) -> Any:
        return self.scalars().one_or_none()

    def __iter__(self) -> Iterator[Row]:
        return iter(self._rows)


# ── Session ────────────────────────────────────────────────────────────────────

_database_factory: Callable[[], Any] | None = None


def configure(factory: Callable[[], Any]) -> None:
    """Sets how sessions reach the database (app/db.py does this at import)."""
    global _database_factory
    _database_factory = factory


def _children() -> dict[str, list[tuple[type[Model], str, str]]]:
    out: dict[str, list[tuple[type[Model], str, str]]] = {}
    for name, m in MODELS.items():
        if name != m.__tablename__:
            continue
        for col in m.__columns__.values():
            if col.fk:
                out.setdefault(col.fk[0], []).append((m, col.name, col.fk[1]))
    return out


def _agg_spec(e: Any) -> Any:
    """Mongo $group accumulator for an aggregate expression."""
    if isinstance(e, Label):
        return _agg_spec(e.expr)
    assert isinstance(e, FuncExpr)
    if e.name == "count":
        return {"$sum": 1}
    if e.name == "coalesce":
        return _agg_spec(e.args[0])
    field = "$" + _key(e.args[0])
    return {f"${e.name}": field}


def _unwrap(e: Any) -> Any:
    return e.expr if isinstance(e, Label) else e


def _entity_key(e: Any, i: int) -> str:
    if isinstance(e, Label):
        return e.name
    if isinstance(e, Column):
        return e.name
    if isinstance(e, FuncExpr):
        return f"{e.name}_{i}"
    if isinstance(e, type):
        return e.__name__
    return f"col_{i}"


def _same(a: Any, b: Any) -> bool:
    a, b = _unwrap(a), _unwrap(b)
    if a is b:
        return True
    if isinstance(a, FuncExpr) and isinstance(b, FuncExpr) and a.name == b.name:
        return all(x is y for x, y in zip(a.args, b.args, strict=False)) and len(a.args) == len(b.args)
    return False


class Session:
    def __init__(self, database: Any = None):
        if database is None:
            assert _database_factory is not None, "odm.configure() was not called"
            database = _database_factory()
        self.db = database
        self._map: dict[tuple[type[Model], Any], Model] = {}
        self._snap: dict[int, dict[str, Any]] = {}
        self._new: list[Model] = []
        self._deleted: list[Model] = []

    # context manager, like sessionmaker()
    def __enter__(self) -> Session:
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._map.clear()
        self._snap.clear()
        self._new.clear()
        self._deleted.clear()

    def col(self, model: type[Model]) -> Any:
        return self.db[model.__tablename__]

    # identity map
    def _attach(self, obj: Model) -> None:
        obj.__dict__["_session"] = self
        self._map[(type(obj), obj._pk_value)] = obj
        self._snap[id(obj)] = _snapshot(obj)

    def _dirty(self, obj: Model) -> dict[str, Any]:
        snap = self._snap.get(id(obj), {})
        return {k: obj.__dict__.get(k) for k in obj.__columns__ if obj.__dict__.get(k) != snap.get(k)}

    def _load(self, model: type[Model], doc: dict[str, Any]) -> Model:
        pk = doc["_id"]
        obj = self._map.get((model, pk))
        if obj is not None:
            if not self._dirty(obj):
                self._fill(obj, doc)
                self._snap[id(obj)] = _snapshot(obj)
            return obj
        obj = model.__new__(model)
        self._fill(obj, doc)
        self._attach(obj)
        return obj

    @staticmethod
    def _fill(obj: Model, doc: dict[str, Any]) -> None:
        for name, col in obj.__columns__.items():
            obj.__dict__[name] = _from_mongo(doc.get("_id" if col.primary_key else name))

    # basic API
    def get(self, model: type[Model], pk: Any) -> Any:
        if pk is None:
            return None
        obj = self._map.get((model, pk))
        if obj is not None:
            return obj
        doc = self.col(model).find_one({"_id": pk})
        return None if doc is None else self._load(model, doc)

    def add(self, obj: Model) -> None:
        if (type(obj), obj._pk_value) in self._map or obj in self._new:
            return
        obj.__dict__["_session"] = self
        self._new.append(obj)

    def add_all(self, objs: Iterable[Model]) -> None:
        for o in objs:
            self.add(o)

    def delete(self, obj: Model) -> None:
        if obj in self._new:
            self._new.remove(obj)
            return
        self._deleted.append(obj)

    def flush(self) -> None:
        new, self._new = self._new, []
        for obj in new:
            try:
                self.col(type(obj)).insert_one(to_doc(obj))
            except _DUPLICATE as e:
                raise IntegrityError(str(e)) from None
            self._attach(obj)
        for obj in list(self._map.values()):
            changes = self._dirty(obj)
            if not changes:
                continue
            for name, col in obj.__columns__.items():
                if col.onupdate and name not in changes:
                    obj.__dict__[name] = col.onupdate()
                    changes[name] = obj.__dict__[name]
            sets = {k: v for k, v in changes.items() if v is not None and not obj.__columns__[k].primary_key}
            unsets = {k: "" for k, v in changes.items() if v is None and not obj.__columns__[k].primary_key}
            op: dict[str, Any] = {}
            if sets:
                op["$set"] = sets
            if unsets:
                op["$unset"] = unsets
            if op:
                try:
                    self.col(type(obj)).update_one({"_id": obj._pk_value}, op)
                except _DUPLICATE as e:
                    raise IntegrityError(str(e)) from None
            self._snap[id(obj)] = _snapshot(obj)
        deleted, self._deleted = self._deleted, []
        for obj in deleted:
            self._delete_ids(type(obj), [obj._pk_value])

    commit = flush

    def rollback(self) -> None:
        self._new.clear()
        self._deleted.clear()
        for obj in self._map.values():
            snap = self._snap.get(id(obj))
            if snap:
                obj.__dict__.update(snap)

    def refresh(self, obj: Model, attribute_names: Any = None) -> None:
        doc = self.col(type(obj)).find_one({"_id": obj._pk_value})
        if doc is not None:
            self._fill(obj, doc)
            self._snap[id(obj)] = _snapshot(obj)

    def expire(self, obj: Model, attribute_names: Any = None) -> None:
        self.refresh(obj)

    def expire_all(self) -> None:
        for obj in list(self._map.values()):
            self.refresh(obj)

    def expunge(self, obj: Model) -> None:
        self._map.pop((type(obj), obj._pk_value), None)

    # deletes with cascades
    def _delete_ids(self, model: type[Model], ids: list[Any]) -> int:
        if not ids:
            return 0
        for child, field, action in _children().get(model.__tablename__, []):
            if action == "CASCADE":
                child_ids = [d["_id"] for d in self.col(child).find({field: {"$in": ids}}, {"_id": 1})]
                self._delete_ids(child, child_ids)
            else:
                self.col(child).update_many({field: {"$in": ids}}, {"$unset": {field: ""}})
                for (m, _), obj in list(self._map.items()):
                    if m is child and obj.__dict__.get(field) in ids:
                        obj.__dict__[field] = None
                        self._snap.setdefault(id(obj), {})[field] = None
        n = self.col(model).delete_many({"_id": {"$in": ids}}).deleted_count
        for pk in ids:
            self._map.pop((model, pk), None)
        return n

    # queries
    def execute(self, stmt: Any) -> Result:
        if isinstance(stmt, Update):
            return self._run_update(stmt)
        if isinstance(stmt, Delete):
            f = to_filter(And(stmt.wheres)) if stmt.wheres else {}
            ids = [d["_id"] for d in self.col(stmt.model_cls).find(f, {"_id": 1})]
            return Result(rowcount=self._delete_ids(stmt.model_cls, ids))
        assert isinstance(stmt, Select), stmt
        return Result(self._run_select(stmt))

    def query(self, model: type[Model]) -> Query:
        return Query(self, select(model))

    def scalars(self, stmt: Select) -> ScalarResult:
        return self.execute(stmt).scalars()

    def scalar(self, stmt: Select) -> Any:
        return self.execute(stmt).scalar()

    def _run_update(self, stmt: Update) -> Result:
        model = stmt.model_cls
        f = to_filter(And(stmt.wheres)) if stmt.wheres else {}
        sets: dict[str, Any] = {}
        unsets: dict[str, Any] = {}
        incs: dict[str, Any] = {}
        for k, v in stmt.vals.items():
            col = model.__columns__[k]
            key = "_id" if col.primary_key else k
            if isinstance(v, Arith):
                if _key(v.field) != key:
                    raise TypeError("Only `field = field ± n` updates are supported.")
                incs[key] = v.delta
            elif v is None:
                unsets[key] = ""
            else:
                sets[key] = v
        for name, col in model.__columns__.items():
            if col.onupdate and name not in stmt.vals:
                sets[name] = col.onupdate()
        op: dict[str, Any] = {}
        if sets:
            op["$set"] = sets
        if unsets:
            op["$unset"] = unsets
        if incs:
            op["$inc"] = incs
        ids = [d["_id"] for d in self.col(model).find(f, {"_id": 1})]
        if not ids or not op:
            return Result(rowcount=len(ids) if not op else 0)
        # Re-apply the filter with the ids so conditional updates (remaining >= n) stay atomic.
        res = self.col(model).update_many({"$and": [f, {"_id": {"$in": ids}}]} if f else {"_id": {"$in": ids}}, op)
        touched = list(sets) + list(unsets) + list(incs)
        for doc in self.col(model).find({"_id": {"$in": [pk for (m, pk) in self._map if m is model and pk in ids]}}):
            obj = self._map[(model, doc["_id"])]
            for k in touched:
                name = model.__pk__ if k == "_id" else k
                obj.__dict__[name] = _from_mongo(doc.get(k))
                self._snap.setdefault(id(obj), {})[name] = obj.__dict__[name]
        return Result(rowcount=res.matched_count)

    def _sort(self, stmt: Select) -> list[tuple[str, int]]:
        out = []
        for o in stmt.orders:
            expr, direction = (o.expr, o.direction) if isinstance(o, Order) else (o, ASCENDING)
            out.append((_key(_unwrap(expr)), direction))
        return out

    def _run_select(self, stmt: Select) -> list[Row]:
        model = stmt.model()
        coll = self.col(model)
        f = stmt.filter_doc
        ents = stmt.entities
        keys = [_entity_key(e, i) for i, e in enumerate(ents)]
        for e in ents:
            m = _model_of(e)
            if m is not None and m is not model:
                raise TypeError("Selecting from two collections needs a hand-written query.")

        aggs = [isinstance(_unwrap(e), FuncExpr) and _unwrap(e).is_aggregate for e in ents]
        if stmt.groups or any(aggs):
            group_id: Any = {f"g{i}": "$" + _key(g) for i, g in enumerate(stmt.groups)} if stmt.groups else None
            spec: dict[str, Any] = {"_id": group_id}
            for i, e in enumerate(ents):
                if aggs[i]:
                    spec[f"a{i}"] = _agg_spec(e)
            if not stmt.groups and len(ents) == 1 and isinstance(_unwrap(ents[0]), FuncExpr) and _unwrap(ents[0]).name == "count":
                return [Row([coll.count_documents(f)], keys)]
            pipeline: list[dict[str, Any]] = [{"$match": f}, {"$group": spec}]
            docs = list(coll.aggregate(pipeline))
            rows: list[Row] = []
            if not stmt.groups and not docs:
                docs = [{}]
            for d in docs:
                vals = []
                for i, e in enumerate(ents):
                    u = _unwrap(e)
                    if aggs[i]:
                        v = _from_mongo(d.get(f"a{i}"))
                        if isinstance(u, FuncExpr) and u.name == "count" and v is None:
                            v = 0
                        if isinstance(u, FuncExpr) and u.name == "coalesce" and v is None:
                            v = u.args[1]
                        vals.append(v)
                    else:
                        gi = next((j for j, g in enumerate(stmt.groups) if _same(g, u)), None)
                        if gi is None:
                            raise TypeError("A selected column must be grouped.")
                        vals.append(_from_mongo((d.get("_id") or {}).get(f"g{gi}")))
                rows.append(Row(vals, keys))
            for o in reversed(stmt.orders):
                expr, direction = (o.expr, o.direction) if isinstance(o, Order) else (o, ASCENDING)
                idx = next((i for i, e in enumerate(ents) if _same(e, expr) or (isinstance(expr, str) and keys[i] == expr)), None)
                if idx is None:
                    raise TypeError("Order grouped results by one of the selected columns.")
                rows.sort(key=lambda r, i=idx: (r[i] is None, r[i]) if direction == ASCENDING else (r[i] is not None, r[i]), reverse=direction == DESCENDING)
            if stmt._offset:
                rows = rows[stmt._offset :]
            if stmt._limit is not None:
                rows = rows[: stmt._limit]
            return rows

        whole = len(ents) == 1 and isinstance(ents[0], type)
        simple_sort = all(isinstance(_unwrap(o.expr if isinstance(o, Order) else o), Column) for o in stmt.orders)
        projection = None if whole or not simple_sort else {_key(_unwrap(e)): 1 for e in ents}
        cur = coll.find(f, projection)
        if simple_sort:
            sort = self._sort(stmt)
            if sort:
                cur = cur.sort(sort)
            if stmt._offset:
                cur = cur.skip(stmt._offset)
            if stmt._limit is not None:
                cur = cur.limit(stmt._limit)
            docs = list(cur)
        else:
            # Sorting by an expression (e.g. `field.is_(None)` to put blanks last): sort here, then page.
            docs = _sort_docs(list(cur), stmt.orders)[stmt._offset :]
            if stmt._limit is not None:
                docs = docs[: stmt._limit]
        if whole:
            return [Row([self._load(model, d)], keys) for d in docs]
        return [Row([_from_mongo(d.get(_key(_unwrap(e)))) for e in ents], keys) for d in docs]


class Query:
    """The legacy `session.query(Model).filter_by(...).one()` style (used by tests and scripts)."""

    def __init__(self, session: Session, stmt: Select):
        self.session, self.stmt = session, stmt

    def filter(self, *conds: Cond) -> Query:
        return Query(self.session, self.stmt.where(*conds))

    def filter_by(self, **kw: Any) -> Query:
        m = self.stmt.model()
        return self.filter(*(getattr(m, k) == v for k, v in kw.items()))

    def order_by(self, *o: Any) -> Query:
        return Query(self.session, self.stmt.order_by(*o))

    def limit(self, n: int) -> Query:
        return Query(self.session, self.stmt.limit(n))

    def all(self) -> list[Any]:
        return self.session.scalars(self.stmt).all()

    def first(self) -> Any:
        return self.session.scalars(self.stmt.limit(1)).first()

    def one(self) -> Any:
        return self.session.scalars(self.stmt).one()

    def one_or_none(self) -> Any:
        return self.session.scalars(self.stmt).one_or_none()

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(self.stmt.model()).where(*self.stmt.wheres)) or 0

    def get(self, pk: Any) -> Any:
        return self.session.get(self.stmt.model(), pk)

    def __iter__(self) -> Iterator[Any]:
        return iter(self.all())

    def delete(self, synchronize_session: Any = None) -> int:
        return self.session.execute(Delete(self.stmt.model()).where(*self.stmt.wheres)).rowcount

    def update(self, values: dict[str, Any], synchronize_session: Any = None) -> int:
        return self.session.execute(Update(self.stmt.model()).where(*self.stmt.wheres).values(**values)).rowcount


def _sort_docs(docs: list[dict[str, Any]], orders: list[Any]) -> list[dict[str, Any]]:
    """SQL ORDER BY in Python: NULLs first ascending, last descending; `x.is_(None)` sorts False first."""
    for o in reversed(orders):
        expr, direction = (o.expr, o.direction) if isinstance(o, Order) else (o, ASCENDING)
        expr = _unwrap(expr)
        if isinstance(expr, Cmp) and expr.op in ("eq", "ne_any") and expr.right is None:
            k = _key(expr.left)
            want_null = expr.op == "eq"
            docs.sort(key=lambda d, k=k, w=want_null: (d.get(k) is None) == w, reverse=direction == DESCENDING)
        elif isinstance(expr, Column):
            k = _key(expr)
            present = [d for d in docs if d.get(k) is not None]
            missing = [d for d in docs if d.get(k) is None]
            present.sort(key=lambda d, k=k: _from_mongo(d[k]), reverse=direction == DESCENDING)
            docs = missing + present if direction == ASCENDING else present + missing
        else:
            raise TypeError(f"Can't sort by {expr!r}.")
    return docs


def ensure_indexes(database: Any) -> None:
    """Creates each model's indexes (unique keys too). Safe to run on every start."""
    for name, m in MODELS.items():
        if name != m.__tablename__:
            continue
        coll = database[m.__tablename__]
        for col in m.__columns__.values():
            if col.primary_key:
                continue
            if col.unique:
                coll.create_index([(col.name, ASCENDING)], unique=True, sparse=True, name=f"{m.__tablename__}_{col.name}_key")
            elif col.index or col.fk:
                coll.create_index([(col.name, ASCENDING)], name=f"{m.__tablename__}_{col.name}_idx")
        for ix in m.__table_args__:
            coll.create_index([(fld, ASCENDING) for fld in ix.fields], unique=ix.unique, name=ix.name)
ColumnElement = Cond  # type alias the clip filters were annotated with
