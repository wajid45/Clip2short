"""HTTP helpers: error type, JSON encoding identical to the previous API, and body validation."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError


class HttpError(Exception):
    def __init__(self, status: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


def iso(dt: datetime | None) -> str | None:
    """JavaScript-style ISO time (`2026-11-17T12:45:00.000Z`), as the web app expects."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    dt = dt.astimezone(UTC)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _default(o: Any):
    if isinstance(o, datetime):
        return iso(o)
    if hasattr(o, "to_dict"):
        return o.to_dict()
    if isinstance(o, BaseModel):
        return o.model_dump()
    raise TypeError(f"Not JSON serializable: {type(o).__name__}")


def dumps(data: Any, indent: int | None = None) -> str:
    return json.dumps(data, default=_default, ensure_ascii=False, separators=None if indent else (",", ":"), indent=indent)


class AppJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return dumps(content).encode("utf-8")


def json_response(data: Any, status: int = 200, headers: dict[str, str] | None = None) -> AppJSONResponse:
    return AppJSONResponse(data, status_code=status, headers=headers)


def error_body(err: HttpError) -> dict[str, Any]:
    body: dict[str, Any] = {"error": err.message}
    if err.code:
        body["code"] = err.code
    return body


def validation_message(e: ValidationError) -> str:
    first = e.errors()[0] if e.errors() else None
    if not first:
        return "Invalid input"
    path = ".".join(str(p) for p in first["loc"]) or "input"
    msg = first["msg"]
    for prefix in ("Value error, ", "Assertion failed, "):
        if msg.startswith(prefix):
            msg = msg[len(prefix) :]
    return f"{path}: {msg}"


def validate[T: BaseModel](model: type[T], data: Any) -> T:
    """Validates a JSON body against a route's model; errors read "field: message" like the web app expects."""
    if data is None:
        raise HttpError(400, "Request body must be JSON.")
    try:
        return model.model_validate(data)
    except ValidationError as e:
        raise HttpError(400, validation_message(e)) from None
