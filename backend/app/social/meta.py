"""Facebook Pages (Facebook Login) and Instagram professional accounts (Instagram Login)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode

from ..db import utcnow
from ..integrations import cred, is_configured
from .base import AccountContext, ConnectedAccount, Provider, PublishError, PublishInput, PublishResult, Refreshed, api, sleep

GRAPH = "https://graph.facebook.com/v23.0"


def _exchange_user_token(code: str, redirect_uri: str) -> str:
    c = cred("meta")
    short = api(f"{GRAPH}/oauth/access_token", params={"client_id": c.id or "", "client_secret": c.secret or "", "redirect_uri": redirect_uri, "code": code})
    long = api(
        f"{GRAPH}/oauth/access_token",
        params={"grant_type": "fb_exchange_token", "client_id": c.id or "", "client_secret": c.secret or "", "fb_exchange_token": short["access_token"]},
    )
    return long["access_token"]


def _list_pages(user_token: str) -> list[dict[str, Any]]:
    res = api(
        f"{GRAPH}/me/accounts",
        params={
            "fields": "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
            "limit": "100",
            "access_token": user_token,
        },
    )
    return res.get("data") or []


def _authorize(scopes: list[str], state: str, redirect_uri: str) -> str:
    q = {"client_id": cred("meta").id or "", "redirect_uri": redirect_uri, "state": state, "response_type": "code", "scope": ",".join(scopes)}
    return f"https://www.facebook.com/v23.0/dialog/oauth?{urlencode(q)}"


class Facebook(Provider):
    id = "facebook"

    def configured(self) -> bool:
        return is_configured("meta")

    def authorize_url(self, *, state: str, redirect_uri: str, code_challenge: str | None = None) -> str:
        return _authorize(["pages_show_list", "pages_manage_posts", "pages_read_engagement", "read_insights"], state, redirect_uri)

    def exchange(self, *, code: str, redirect_uri: str, code_verifier: str | None = None) -> list[ConnectedAccount]:
        pages = _list_pages(_exchange_user_token(code, redirect_uri))
        if not pages:
            raise RuntimeError("No Facebook Pages were shared. Posting requires a Page you manage.")
        return [
            ConnectedAccount(
                externalId=p["id"],
                displayName=p["name"],
                avatarUrl=((p.get("picture") or {}).get("data") or {}).get("url"),
                accessToken=p["access_token"],  # page tokens from a long-lived user token don't expire
            )
            for p in pages
        ]

    def publish(self, acc: AccountContext, data: PublishInput) -> PublishResult:
        res = api(f"{GRAPH}/{acc.externalId}/feed", method="POST", form={"message": data.text, "link": data.link, "access_token": acc.accessToken})
        return PublishResult(externalId=res["id"], liveUrl=f"https://www.facebook.com/{res['id']}")

    def stats(self, acc: AccountContext, external_id: str) -> dict[str, int | None]:
        r = api(
            f"{GRAPH}/{external_id}",
            params={"fields": "shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)", "access_token": acc.accessToken},
        )
        views = None
        try:
            ins = api(f"{GRAPH}/{external_id}/insights", params={"metric": "post_impressions", "access_token": acc.accessToken})
            views = (((ins.get("data") or [{}])[0].get("values") or [{}])[0]).get("value")
        except PublishError:
            pass  # insights need read_insights and enough Page followers; keep the other stats
        return {
            "views": views,
            "likes": ((r.get("reactions") or {}).get("summary") or {}).get("total_count"),
            "comments": ((r.get("comments") or {}).get("summary") or {}).get("total_count"),
            "shares": (r.get("shares") or {}).get("count", 0),
        }


IG_GRAPH = "https://graph.instagram.com/v23.0"
IG_TOKEN_TTL = timedelta(days=60)


def _ig_long_lived(short_token: str) -> tuple[str, datetime]:
    """Swaps a 1-hour Instagram token for a 60-day one."""
    r = api("https://graph.instagram.com/access_token", params={"grant_type": "ig_exchange_token", "client_secret": cred("instagram").secret or "", "access_token": short_token})
    return r["access_token"], utcnow() + timedelta(seconds=int(r.get("expires_in") or IG_TOKEN_TTL.total_seconds()))


class Instagram(Provider):
    """Instagram professional accounts through Instagram Login: people sign in on instagram.com,
    no Facebook account or linked Page needed. Accounts connected earlier through Facebook Login
    (they carry a pageId) keep working on the Facebook Graph host."""

    id = "instagram"
    refresh_ahead = timedelta(days=7)  # 60-day tokens, renewed in their last week

    def configured(self) -> bool:
        return is_configured("instagram")

    def authorize_url(self, *, state: str, redirect_uri: str, code_challenge: str | None = None) -> str:
        q = {
            "client_id": cred("instagram").id or "",
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights",
            "state": state,
        }
        return f"https://www.instagram.com/oauth/authorize?{urlencode(q)}"

    def exchange(self, *, code: str, redirect_uri: str, code_verifier: str | None = None) -> list[ConnectedAccount]:
        c = cred("instagram")
        short = api(
            "https://api.instagram.com/oauth/access_token",
            method="POST",
            form={"client_id": c.id or "", "client_secret": c.secret or "", "grant_type": "authorization_code", "redirect_uri": redirect_uri, "code": code},
        )
        token, expires = _ig_long_lived(short["access_token"])
        me = api(f"{IG_GRAPH}/me", params={"fields": "user_id,username,name,profile_picture_url,account_type", "access_token": token})
        if me.get("account_type") not in (None, "BUSINESS", "MEDIA_CREATOR"):
            raise RuntimeError("Posting needs an Instagram Business or Creator account. Switch it in the Instagram app (Settings, Account type), then connect again.")
        return [
            ConnectedAccount(
                externalId=str(me.get("user_id") or me["id"]),
                displayName=me.get("name") or me.get("username") or "Instagram",
                username=me.get("username"),
                avatarUrl=me.get("profile_picture_url"),
                accessToken=token,
                tokenExpiresAt=expires,
            )
        ]

    def refresh(self, acc: AccountContext) -> Refreshed | None:
        if acc.meta.get("pageId"):
            return None  # Facebook Login page tokens don't expire
        r = api("https://graph.instagram.com/refresh_access_token", params={"grant_type": "ig_refresh_token", "access_token": acc.accessToken})
        return Refreshed(accessToken=r["access_token"], tokenExpiresAt=utcnow() + timedelta(seconds=int(r.get("expires_in") or IG_TOKEN_TTL.total_seconds())))

    @staticmethod
    def _host(acc: AccountContext) -> str:
        return GRAPH if acc.meta.get("pageId") else IG_GRAPH

    def publish(self, acc: AccountContext, data: PublishInput) -> PublishResult:
        if not data.imageUrl:
            raise PublishError("Instagram needs an image, and this video has no thumbnail.")
        host = self._host(acc)
        container = api(f"{host}/{acc.externalId}/media", method="POST", form={"image_url": data.imageUrl, "caption": data.text, "access_token": acc.accessToken})
        for _ in range(10):
            st = api(f"{host}/{container['id']}", params={"fields": "status_code,status", "access_token": acc.accessToken})
            if st.get("status_code") == "FINISHED":
                break
            if st.get("status_code") in ("ERROR", "EXPIRED"):
                raise PublishError(f"Instagram couldn't process the image ({st.get('status') or st.get('status_code')}).")
            sleep(2)
        published = api(f"{host}/{acc.externalId}/media_publish", method="POST", form={"creation_id": container["id"], "access_token": acc.accessToken})
        live_url = None
        try:
            live_url = api(f"{host}/{published['id']}", params={"fields": "permalink", "access_token": acc.accessToken}).get("permalink")
        except PublishError:
            pass  # the permalink is optional
        return PublishResult(externalId=published["id"], liveUrl=live_url)

    def stats(self, acc: AccountContext, external_id: str) -> dict[str, int | None]:
        host = self._host(acc)
        m = api(f"{host}/{external_id}", params={"fields": "like_count,comments_count", "access_token": acc.accessToken})
        views = shares = None
        try:
            ins = api(f"{host}/{external_id}/insights", params={"metric": "views,shares", "access_token": acc.accessToken})
            for d in ins.get("data") or []:
                value = ((d.get("values") or [{}])[0]).get("value")
                if d.get("name") == "views":
                    views = value
                if d.get("name") == "shares":
                    shares = value
        except PublishError:
            pass  # insights unavailable for this media
        return {"views": views, "likes": m.get("like_count"), "comments": m.get("comments_count"), "shares": shares}
