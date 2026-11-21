"""Records money moving through Stripe in the Payment table, for the admin portal's Payments page.

Called from the Stripe webhook (live) and from the local test-mode grants (live=False). Every call
is idempotent on `ref`: a retried webhook updates the row instead of adding a second one.
"""

from __future__ import annotations

from .models import Payment, User
from .odm import Session, or_, select


def record_payment(
    s: Session,
    *,
    ref: str,
    user_id: str | None,
    kind: str,
    status: str,
    amount_cents: int | None,
    currency: str = "usd",
    description: str,
    payment_intent: str | None = None,
    live: bool = True,
) -> Payment:
    row = s.scalar(select(Payment).where(Payment.ref == ref))
    email = s.get(User, user_id).email if user_id and s.get(User, user_id) else None
    if row is None:
        row = Payment(ref=ref, kind=kind, description=description, live=live)
        s.add(row)
    row.userId = user_id or row.userId
    row.email = email or row.email
    # A paid invoice that later fails a retry stays paid; a refund is never overwritten by "paid".
    if not (row.status in ("refunded", "partially_refunded") and status == "paid") and not (row.status == "paid" and status == "failed"):
        row.status = status
    if amount_cents is not None:
        row.amountCents = amount_cents
    row.currency = (currency or "usd").lower()
    row.paymentIntent = payment_intent or row.paymentIntent
    row.description = description or row.description
    s.commit()
    return row


def record_refund(s: Session, *, payment_intent: str | None, invoice: str | None, refunded_cents: int, amount_cents: int | None) -> Payment | None:
    """A charge was refunded (fully or in part). Finds the payment by its intent or invoice."""
    conds = [c for c in (Payment.paymentIntent == payment_intent if payment_intent else None, Payment.ref == invoice if invoice else None) if c is not None]
    if not conds:
        return None
    row = s.scalar(select(Payment).where(or_(*conds)))
    if not row:
        return None
    row.refundedCents = refunded_cents
    total = amount_cents if amount_cents is not None else row.amountCents
    row.status = "refunded" if total is not None and refunded_cents >= total else "partially_refunded"
    s.commit()
    return row
