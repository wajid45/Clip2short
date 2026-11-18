"""Anthropic client and error messages a customer can act on."""

from __future__ import annotations

import threading

import anthropic

from ..config import settings

# Server-side refusal fallback (opt-in beta): a policy decline is retried on the default fallback model.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

_client: anthropic.Anthropic | None = None
_lock = threading.Lock()


def ai_configured() -> bool:
    return bool(settings.anthropic_key)


def client() -> anthropic.Anthropic:
    global _client
    if not settings.anthropic_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set, so AI analysis is unavailable.")
    with _lock:
        if _client is None:
            _client = anthropic.Anthropic(api_key=settings.anthropic_key, max_retries=3, timeout=10 * 60)
        return _client


def describe_ai_error(err: BaseException) -> str:
    if isinstance(err, anthropic.RateLimitError):
        return "The AI service is busy right now. Please retry in a minute."
    if isinstance(err, anthropic.AuthenticationError):
        return "The AI service key is invalid. Contact support."
    if isinstance(err, anthropic.BadRequestError):
        return f"The AI request was rejected: {err.message}"
    if isinstance(err, anthropic.InternalServerError):
        return "The AI service had a temporary error. Please retry."
    if isinstance(err, anthropic.APIConnectionError):
        return "Couldn't reach the AI service. Please retry."
    return str(err) or "AI analysis failed."
