"""Development-only provider. Simulates publishing so the full flow (queue, schedule, publish,
failures, stats) can be tested without real accounts. Text containing "#fail" fails on purpose."""

from __future__ import annotations

import math
import re
import time

from ..config import settings
from ..security import random_token
from .base import AccountContext, ConnectedAccount, Provider, PublishInput, PublishResult


class Sandbox(Provider):
    id = "sandbox"

    def configured(self) -> bool:
        return settings.social_sandbox

    def authorize_url(self, **_: object) -> str:
        return ""

    def exchange(self, **_: object) -> list[ConnectedAccount]:
        return [ConnectedAccount(externalId=f"sandbox-{random_token(6)}", displayName="Sandbox account", username="sandbox", accessToken="sandbox")]

    def publish(self, acc: AccountContext, data: PublishInput) -> PublishResult:
        time.sleep(0.4)
        if re.search(r"#fail\b", data.text, re.I):
            raise RuntimeError("Sandbox: simulated failure because the text contains #fail.")
        pid = f"sbx_{random_token(8)}"
        return PublishResult(externalId=pid, liveUrl=f"{settings.app_url}/app/queue?post={pid}")

    def stats(self, acc: AccountContext, external_id: str) -> dict[str, int | None]:
        # Deterministic, slowly growing numbers so analytics are testable.
        h = 0
        for ch in external_id:
            h = (h * 31 + ord(ch)) & 0xFFFFFFFF
        age = 1 + ((time.time() * 1000 / 3.6e6) % 48)
        views = round((200 + (h % 5000)) * math.log2(1 + age))
        return {"views": views, "likes": round(views * 0.06), "comments": round(views * 0.008), "shares": round(views * 0.01)}
