"""Counts what every Gemini request costs, for the admin overview's AI spending cards.

Google bills per million tokens: input (the prompt) at one price, output (the answer plus any
thinking) at another. Prices differ by model and change over time, so they are configured, not
hard-coded: GEMINI_PRICES="model=input/output; other-model=input/output" in US dollars per million
tokens, e.g. GEMINI_PRICES="gemini-x=0.30/2.50". A model without a price is still counted (calls
and tokens); its cost shows as not set.
"""

from __future__ import annotations

import logging
from typing import Any

from ..config import settings
from ..db import SessionLocal
from ..models import AiUsage

log = logging.getLogger("clip2short.ai.usage")


def price_for(model: str) -> tuple[float, float] | None:
    return settings.gemini_prices.get(model)


def record(resp: Any, *, model: str, purpose: str) -> None:
    """Saves one request's token counts. Never raises: tracking must not break an analysis."""
    try:
        meta = getattr(resp, "usage_metadata", None)
        if meta is None:
            return
        inp = int(getattr(meta, "prompt_token_count", 0) or 0)
        out = int(getattr(meta, "candidates_token_count", 0) or 0)
        think = int(getattr(meta, "thoughts_token_count", 0) or 0)
        cached = int(getattr(meta, "cached_content_token_count", 0) or 0)
        price = price_for(model)
        cost = round(inp * price[0] + (out + think) * price[1]) if price else None  # $/1M tokens × tokens = micro-dollars
        with SessionLocal() as s:
            s.add(AiUsage(model=model, purpose=purpose, inputTokens=inp, outputTokens=out + think, thinkingTokens=think, cachedTokens=cached, costMicros=cost))
            s.commit()
    except Exception:
        log.exception("couldn't record AI usage")
