"""Transactional email through Resend (https://resend.com).

Without RESEND_API_KEY, development prints the email to the API log so flows can be tested;
production logs a warning instead of silently pretending the email went out.
"""

from __future__ import annotations

import html
import logging

import httpx

from .config import settings

log = logging.getLogger("shortlark.email")


class EmailError(RuntimeError):
    pass


def email_configured() -> bool:
    return bool(settings.resend_key)


def send_email(to: str, subject: str, html_body: str, text_body: str) -> None:
    if not settings.resend_key:
        if settings.is_prod:
            log.warning("RESEND_API_KEY is not set; email to %s was not sent (%s)", to, subject)
        else:
            log.info("Email (not sent, no RESEND_API_KEY)\n  To: %s\n  Subject: %s\n%s", to, subject, text_body)
        return
    try:
        res = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "html": html_body, "text": text_body},
            timeout=15,
        )
    except httpx.HTTPError as e:
        raise EmailError(f"Couldn't reach the email service: {e}") from None
    if not res.is_success:
        raise EmailError(f"The email service refused the message (HTTP {res.status_code}).")


def _layout(title: str, body_html: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141414">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6e8ec;border-radius:14px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.02em">shortlark</p>
<h1 style="margin:0 0 12px;font-size:20px;letter-spacing:-0.02em">{html.escape(title)}</h1>
{body_html}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#8a909b">Shortlark · You received this because of activity on your account.</p>
</td></tr></table></body></html>"""


def send_password_reset(to: str, name: str | None, link: str, minutes: int) -> None:
    hello = f"Hi {name}," if name else "Hi,"
    text = (
        f"{hello}\n\nSomeone asked to reset the password for your Shortlark account. "
        f"Open this link within {minutes} minutes to choose a new password:\n\n{link}\n\n"
        "If you didn't ask for this, ignore this email; your password stays the same."
    )
    body = f"""<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d4048">{html.escape(hello)} someone asked to reset the password for your Shortlark account. The link works for {minutes} minutes.</p>
<p style="margin:0 0 24px"><a href="{html.escape(link)}" style="display:inline-block;background:#d9480f;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Choose a new password</a></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#555b66">If you didn't ask for this, ignore this email; your password stays the same.</p>"""
    send_email(to, "Reset your Shortlark password", _layout("Reset your password", body), text)


def _button(link: str, label: str) -> str:
    return f'<p style="margin:0 0 24px"><a href="{html.escape(link)}" style="display:inline-block;background:#d9480f;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:999px">{html.escape(label)}</a></p>'


def _para(text: str) -> str:
    return f'<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d4048">{html.escape(text)}</p>'


def send_welcome(to: str, name: str | None, app_link: str, trial_credits: int) -> None:
    hello = f"Hi {name}," if name else "Hi,"
    lines = [
        f"{hello} welcome to Shortlark. You have {trial_credits} free credits: 1 credit is 1 minute of video.",
        "Paste a link to a stream, podcast or talk, pick its category, and the AI ranks every moment worth clipping.",
    ]
    text = "\n\n".join(lines) + f"\n\nStart here: {app_link}"
    body = "".join(_para(line) for line in lines) + _button(app_link, "Find your first clips")
    send_email(to, "Welcome to Shortlark", _layout("Welcome to Shortlark", body), text)


def send_clips_ready(to: str, name: str | None, video_title: str, count: int, best: int | None, link: str) -> None:
    hello = f"Hi {name}," if name else "Hi,"
    best_line = f" The best one scores {best}." if best is not None else ""
    line = f"{hello} Shortlark found {count} moment{'s' if count != 1 else ''} in “{video_title}”.{best_line}"
    text = f"{line}\n\nOpen them: {link}"
    body = _para(line) + _button(link, "Open your moments")
    send_email(to, f"{count} moment{'s' if count != 1 else ''} ready in “{video_title[:60]}”", _layout("Your clips are ready", body), text)


def send_security_notice(to: str, name: str | None, title: str, what: str, help_link: str) -> None:
    """A change to how someone signs in. Always sent, so the real owner notices a change they didn't make."""
    hello = f"Hi {name}," if name else "Hi,"
    advice = "If this was you, there's nothing to do. If it wasn't, reset your password straight away and contact us."
    text = f"{hello}\n\n{what}\n\n{advice}\n\n{help_link}"
    body = _para(f"{hello} {what}") + _button(help_link, "Secure my account") + _para(advice)
    send_email(to, f"Shortlark: {title.lower()}", _layout(title, body), text)


def send_low_credits(to: str, name: str | None, balance: int, billing_link: str) -> None:
    hello = f"Hi {name}," if name else "Hi,"
    line = f"{hello} you have {balance} credit{'s' if balance != 1 else ''} left, about {balance} minute{'s' if balance != 1 else ''} of video. Top up or pick a plan so your next stream doesn't wait."
    text = f"{line}\n\nBilling: {billing_link}"
    body = _para(line) + _button(billing_link, "Open Billing")
    send_email(to, "Your Shortlark credits are running low", _layout("Credits running low", body), text)
