"""Google Gemini client: structured (JSON-schema) generation and errors a customer can act on."""

from __future__ import annotations

import json
import re
import threading
from typing import Any

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from ..config import settings

_client: genai.Client | None = None
_lock = threading.Lock()

_REFUSALS = {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION", "IMAGE_SAFETY", "MODEL_ARMOR", "JAILBREAK"}


class AiRefusal(RuntimeError):
    pass


def ai_configured() -> bool:
    return bool(settings.gemini_key)


def client() -> genai.Client:
    global _client
    if not settings.gemini_key:
        raise RuntimeError("GEMINI_API_KEY is not set, so AI analysis is unavailable.")
    with _lock:
        if _client is None:
            _client = genai.Client(
                api_key=settings.gemini_key,
                http_options=types.HttpOptions(
                    timeout=10 * 60 * 1000,  # milliseconds
                    retry_options=types.HttpRetryOptions(attempts=4),
                ),
            )
        return _client


def _check(resp: types.GenerateContentResponse, refusal_message: str) -> str:
    """Returns the response text, or raises a clear error for blocked, truncated or empty answers."""
    feedback = resp.prompt_feedback
    if feedback and feedback.block_reason and feedback.block_reason.name in _REFUSALS | {"OTHER"}:
        raise AiRefusal(refusal_message)
    cand = (resp.candidates or [None])[0]
    reason = cand.finish_reason.name if cand and cand.finish_reason else None
    if reason in _REFUSALS:
        raise AiRefusal(refusal_message)
    if reason == "MAX_TOKENS":
        raise RuntimeError("The AI response was cut off. Please retry.")
    text = resp.text or ""
    if not text.strip():
        raise RuntimeError("The AI returned an empty result. Please retry.")
    return text


def generate[T: BaseModel](
    schema: type[T],
    *,
    system: str,
    prompt: str,
    thinking: str = "medium",
    refusal_message: str = "The AI declined to process this content.",
    max_output_tokens: int = 65536,
    model: str | None = None,
) -> T:
    """One request that must come back as JSON matching `schema` (Gemini structured output).

    `model` overrides GEMINI_MODEL (the category engines pass their own)."""
    resp = client().models.generate_content(
        model=model or settings.gemini_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            thinking_config=types.ThinkingConfig(thinking_level=thinking.upper()),  # type: ignore[arg-type]
            max_output_tokens=max_output_tokens,
        ),
    )
    text = _check(resp, refusal_message)
    if isinstance(resp.parsed, schema):
        return resp.parsed
    try:
        return schema.model_validate_json(text)
    except Exception:
        raise RuntimeError("The AI returned an unreadable result. Please retry.") from None


def generate_with_urls[T: BaseModel](schema: type[T], *, prompt: str, thinking: str = "low") -> T | None:
    """A request that may read the web pages named in the prompt (URL context tool).

    Tool use and a response schema aren't combined, so the prompt asks for JSON and we parse it.
    """
    resp = client().models.generate_content(
        model=settings.gemini_model,
        contents=f"{prompt}\n\nReply with only a JSON object matching this JSON schema, no prose:\n{json.dumps(schema.model_json_schema())}",
        config=types.GenerateContentConfig(
            tools=[types.Tool(url_context=types.UrlContext())],
            thinking_config=types.ThinkingConfig(thinking_level=thinking.upper()),  # type: ignore[arg-type]
            max_output_tokens=65536,
        ),
    )
    try:
        text = _check(resp, "The AI declined to fetch these pages.")
    except AiRefusal:
        return None
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return schema.model_validate_json(match.group(0))
    except Exception:
        return None


def describe_ai_error(err: BaseException) -> str:
    if isinstance(err, errors.APIError):
        code: Any = getattr(err, "code", None)
        if code == 429:
            return "The AI service is busy right now. Please retry in a minute."
        if code in (401, 403):
            return "The AI service key is invalid or not allowed to use this model. Contact support."
        if code == 404:
            return "The configured AI model isn't available. Check GEMINI_MODEL."
        if isinstance(err, errors.ServerError):
            return "The AI service had a temporary error. Please retry."
        return f"The AI request was rejected: {getattr(err, 'message', None) or err}"
    return str(err) or "AI analysis failed."
