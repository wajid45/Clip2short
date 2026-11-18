"""Building blocks shared by the route modules."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body
from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict

from ..http import HttpError

router_kwargs: dict[str, Any] = {"prefix": "/api"}
JsonBody = Annotated[Any, Body()]
"""The raw JSON body; each route validates it with its own model (so errors read like the web app expects)."""


class Model(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=False)


def api_router() -> APIRouter:
    return APIRouter(**router_kwargs)


# ── Field helpers with the same messages the web app shows ───────────────────


def _strip(v: Any) -> Any:
    return v.strip() if isinstance(v, str) else v


def text(min_len: int = 0, max_len: int | None = None, *, min_msg: str | None = None, max_msg: str | None = None, strip: bool = True):
    def check(v: str) -> str:
        if len(v) < min_len:
            raise ValueError(min_msg or (f"Too small: expected string to have >={min_len} characters"))
        if max_len is not None and len(v) > max_len:
            raise ValueError(max_msg or (f"Too big: expected string to have <={max_len} characters"))
        return v

    validators: list[Any] = [AfterValidator(check)]
    if strip:
        validators.insert(0, BeforeValidator(_strip))
    return Annotated[str, *validators]


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def email(msg: str):
    def check(v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError(msg)
        return v

    return Annotated[str, AfterValidator(check)]


def iso_datetime(v: Any) -> datetime:
    if not isinstance(v, str):
        raise ValueError("Invalid ISO datetime")
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("Invalid ISO datetime") from None
    if dt.tzinfo is None:
        raise ValueError("Invalid ISO datetime")
    return dt


IsoDateTime = Annotated[datetime, BeforeValidator(iso_datetime)]


def not_found(what: str) -> HttpError:
    return HttpError(404, f"{what} not found.")
