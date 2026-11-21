"""Admin portal console commands (run from backend/):

    uv run python -m app.portal_cli reset-2fa you@company.com

Clears that admin's authenticator so the next portal sign-in shows a fresh QR code, and ends
their portal sessions. For a lost phone; needs shell access to the server, by design.
"""

from __future__ import annotations

import sys

from .db import SessionLocal
from .models import AdminAudit, AdminTotp, User
from .odm import select


def reset_2fa(email: str) -> int:
    with SessionLocal() as s:
        user = s.scalar(select(User).where(User.email == email.strip().lower()))
        if not user:
            print(f"No account with the email {email}.")
            return 1
        totp = s.get(AdminTotp, user.id)
        if not totp or not totp.secretEnc:
            print(f"{user.email} has no authenticator set up; the next sign-in already shows the QR code.")
            return 0
        totp.secretEnc, totp.pendingSecretEnc, totp.lastStep = None, None, 0
        totp.sessionVersion += 1
        s.add(AdminAudit(adminId=None, adminEmail="console", action="authenticator_reset", targetUserId=user.id, detail="portal_cli reset-2fa"))
        s.commit()
        print(f"Authenticator cleared for {user.email}. The next portal sign-in shows a new QR code.")
        return 0


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "reset-2fa":
        return reset_2fa(argv[1])
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
