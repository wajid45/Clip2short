"""YouTube via the Data API v3.

Unlike the link/image networks, YouTube needs a real video file: the creator uploads the clip
(cut in their editor). The browser streams it to our server in chunks and we relay each chunk
into a resumable upload session, so nothing is stored on our side. Scheduling uses YouTube's
own `publishAt`, so no file has to wait in our storage.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote, urlencode

import httpx

from ..config import settings
from ..db import utcnow
from ..http import iso
from ..integrations import cred, is_configured
from .base import AccountContext, ConnectedAccount, Provider, PublishError, PublishInput, PublishResult, Refreshed, api

YT = "https://www.googleapis.com/youtube/v3"
YT_CHUNK = 262144 * 14  # 3.5 MiB: a multiple of 256 KiB


def _bearer(acc: AccountContext) -> dict[str, str]:
    return {"Authorization": f"Bearer {acc.accessToken}"}


class YouTube(Provider):
    id = "youtube"
    uses_pkce = True

    def configured(self) -> bool:
        return is_configured("google")

    def authorize_url(self, *, state: str, redirect_uri: str, code_challenge: str | None = None) -> str:
        q = {
            "client_id": cred("google").id or "",
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/youtube",
            "access_type": "offline",
            "prompt": "consent select_account",
            "include_granted_scopes": "true",
            "state": state,
            "code_challenge": code_challenge or "",
            "code_challenge_method": "S256",
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(q)}"

    def exchange(self, *, code: str, redirect_uri: str, code_verifier: str | None = None) -> list[ConnectedAccount]:
        c = cred("google")
        tok = api(
            "https://oauth2.googleapis.com/token",
            method="POST",
            form={
                "code": code,
                "client_id": c.id or "",
                "client_secret": c.secret or "",
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier or "",
            },
        )
        ch = api(f"{YT}/channels?part=snippet&mine=true", headers={"Authorization": f"Bearer {tok['access_token']}"})
        channels = ch.get("items") or []
        if not channels:
            raise RuntimeError("This Google account has no YouTube channel yet. Create one on YouTube, then connect again.")
        expires = utcnow() + timedelta(seconds=tok.get("expires_in") or 3600)
        out = []
        for ch_item in channels:
            sn = ch_item.get("snippet") or {}
            custom = sn.get("customUrl")
            out.append(
                ConnectedAccount(
                    externalId=ch_item["id"],
                    displayName=sn.get("title") or "YouTube channel",
                    username=custom.lstrip("@") if custom else None,
                    avatarUrl=((sn.get("thumbnails") or {}).get("default") or {}).get("url"),
                    accessToken=tok["access_token"],
                    refreshToken=tok.get("refresh_token"),
                    tokenExpiresAt=expires,
                )
            )
        return out

    def refresh(self, acc: AccountContext) -> Refreshed | None:
        if not acc.refreshToken:
            return None
        c = cred("google")
        tok = api(
            "https://oauth2.googleapis.com/token",
            method="POST",
            form={"client_id": c.id or "", "client_secret": c.secret or "", "refresh_token": acc.refreshToken, "grant_type": "refresh_token"},
        )
        return Refreshed(
            accessToken=tok["access_token"],
            refreshToken=tok.get("refresh_token") or acc.refreshToken,
            tokenExpiresAt=utcnow() + timedelta(seconds=tok.get("expires_in") or 3600),
        )

    def publish(self, acc: AccountContext, data: PublishInput) -> PublishResult:
        raise PublishError("YouTube posts need a video file. Use the upload form on the clip.")

    def stats(self, acc: AccountContext, external_id: str) -> dict[str, int | None] | None:
        r = api(f"{YT}/videos?part=statistics&id={quote(external_id)}", headers=_bearer(acc))
        s = ((r.get("items") or [{}])[0]).get("statistics")
        if not s:
            return None
        return {
            "views": int(s.get("viewCount") or 0),
            "likes": int(s["likeCount"]) if s.get("likeCount") is not None else None,
            "comments": int(s["commentCount"]) if s.get("commentCount") is not None else None,
            "shares": None,
        }


def _error_payload(res: httpx.Response) -> dict[str, Any]:
    try:
        return res.json() or {}
    except json.JSONDecodeError:
        return {}


def start_upload(
    acc: AccountContext,
    *,
    title: str,
    description: str,
    tags: list[str],
    privacy: str,
    publish_at: datetime | None,
    made_for_kids: bool,
    size: int,
    mime_type: str,
) -> str:
    """Opens a resumable upload session and returns its URL (kept server-side)."""
    status: dict[str, Any] = {
        # YouTube only honours publishAt on private videos; it flips them public at that time.
        "privacyStatus": "private" if publish_at else privacy,
        "selfDeclaredMadeForKids": made_for_kids,
    }
    if publish_at:
        status["publishAt"] = iso(publish_at)
    with httpx.Client(timeout=30) as c:
        res = c.post(
            "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
            headers={
                **_bearer(acc),
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Length": str(size),
                "X-Upload-Content-Type": mime_type,
                "Origin": settings.app_url,
            },
            content=json.dumps({"snippet": {"title": title, "description": description, "tags": tags[:30], "categoryId": "22"}, "status": status}),
        )
    if not res.is_success:
        err = _error_payload(res).get("error") or {}
        reason = ((err.get("errors") or [{}])[0]).get("reason")
        if reason == "quotaExceeded":
            raise PublishError("YouTube's daily upload quota for this app is used up. Try again tomorrow.", True)
        if reason == "uploadLimitExceeded":
            raise PublishError("This channel hit YouTube's daily upload limit.")
        raise PublishError(err.get("message") or f"YouTube refused the upload (HTTP {res.status_code}).")
    location = res.headers.get("location")
    if not location:
        raise PublishError("YouTube didn't return an upload session.")
    return location


def upload_chunk(upload_url: str, chunk: bytes, offset: int, total: int) -> dict[str, Any]:
    """Sends one chunk. Returns {done: False, received} or {done: True, video}."""
    end = offset + len(chunk) - 1
    try:
        with httpx.Client(timeout=120) as c:
            res = c.put(upload_url, content=chunk, headers={"Content-Length": str(len(chunk)), "Content-Range": f"bytes {offset}-{end}/{total}"})
    except httpx.HTTPError as e:
        raise PublishError(f"Upload failed: {e}", True) from None
    if res.status_code == 308:
        rng = res.headers.get("range")  # e.g. "bytes=0-3670015"
        return {"done": False, "received": int(rng.split("-")[1]) + 1 if rng else 0}
    if res.is_success:
        return {"done": True, "video": res.json()}
    err = _error_payload(res).get("error") or {}
    raise PublishError(err.get("message") or f"Upload failed (HTTP {res.status_code}).", res.status_code >= 500)


def get_video(acc: AccountContext, video_id: str) -> dict[str, Any] | None:
    r = api(f"{YT}/videos?part=status,processingDetails&id={quote(video_id)}", headers=_bearer(acc))
    items = r.get("items") or []
    return items[0] if items else None


def set_privacy(acc: AccountContext, video_id: str, privacy: str, made_for_kids: bool | None = None) -> None:
    """Sets visibility (used by "Post now" on a scheduled upload, by cancel, and to confirm scheduled posts)."""
    status: dict[str, Any] = {"privacyStatus": privacy}
    if made_for_kids is not None:
        status["selfDeclaredMadeForKids"] = made_for_kids
    api(f"{YT}/videos?part=status", method="PUT", headers={**_bearer(acc), "Content-Type": "application/json"}, json_body={"id": video_id, "status": status})


def youtube_url(video_id: str) -> str:
    return f"https://youtu.be/{video_id}"
