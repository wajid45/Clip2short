"""Data model: one MongoDB collection per class. Collection and field names match the old SQL tables
and columns, so the data moved over as it was (see app/migrate_sqlite_to_mongo.py).

Fields are `Column`s from app/odm.py; `fk=` records the old foreign keys so deletes still cascade.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from .db import Base, new_id, utcnow
from .odm import Column, Index, UniqueConstraint, relationship


def _id() -> Any:
    return Column(primary_key=True, default=new_id)


def _created() -> Any:
    return Column(default=utcnow)


def _updated() -> Any:
    return Column(default=utcnow, onupdate=utcnow)


def _user_fk() -> Any:
    return Column(fk=("User", "CASCADE"))


class Serializable:
    """`to_dict()` returns the row with its column names, as the API has always sent them."""

    def to_dict(self, exclude: tuple[str, ...] = ()) -> dict[str, Any]:
        return {k: getattr(self, k) for k in self.__columns__ if k not in exclude}  # type: ignore[attr-defined]


class User(Base, Serializable):
    __tablename__ = "User"
    id: str = _id()
    email: str = Column(unique=True)
    name: str | None = Column()
    passwordHash: str = Column()
    createdAt: datetime = _created()
    updatedAt: datetime = _updated()
    # Billing (Stripe)
    stripeCustomerId: str | None = Column(unique=True)
    stripeSubscriptionId: str | None = Column(unique=True)
    plan: str = Column(default="none")  # none | creator | pro | studio
    subscriptionStatus: str = Column(default="none")
    currentPeriodEnd: datetime | None = Column()
    cancelAtPeriodEnd: bool = Column(default=False)
    # Credits: the free trial is granted once.
    trialStartedAt: datetime | None = Column()
    # Bumped on password change/reset so every other session is signed out.
    sessionVersion: int = Column(default=0)
    # Set by an admin in the portal: the account can't sign in until it is lifted.
    suspendedAt: datetime | None = Column()
    suspendedReason: str | None = Column()


class CreditGrant(Base, Serializable):
    """A batch of credits from one source. Spending draws from the soonest-expiring grants first."""

    __tablename__ = "CreditGrant"
    id: str = _id()
    userId: str = _user_fk()
    source: str = Column()  # trial | plan | pack | admin
    amount: int = Column()
    remaining: int = Column()
    expiresAt: datetime | None = Column()
    ref: str | None = Column(unique=True)  # Stripe invoice / session id, for idempotency
    createdAt: datetime = _created()
    __table_args__ = (Index("CreditGrant_userId_expiresAt_idx", "userId", "expiresAt"),)


class CreditTransaction(Base, Serializable):
    """Append-only history of every credit movement shown to the user."""

    __tablename__ = "CreditTransaction"
    id: str = _id()
    userId: str = _user_fk()
    delta: int = Column()  # positive = added, negative = spent
    kind: str = Column()  # grant | spend | refund
    description: str = Column()
    videoId: str | None = Column()
    allocJson: str | None = Column()  # spend: [{grantId, amount}] for refunds
    refundedAt: datetime | None = Column()
    createdAt: datetime = _created()
    __table_args__ = (Index("CreditTransaction_userId_createdAt_idx", "userId", "createdAt"),)


class Video(Base, Serializable):
    __tablename__ = "Video"
    id: str = _id()
    userId: str = _user_fk()
    sourceUrl: str = Column()
    platform: str = Column()  # youtube | vimeo | direct
    externalId: str | None = Column()
    title: str = Column()
    description: str = Column(default="")
    author: str | None = Column()
    durationSec: float | None = Column()
    thumbnailUrl: str | None = Column()
    createdAt: datetime = _created()
    updatedAt: datetime = _updated()
    # Captions / transcript
    captionStatus: str = Column(default="pending")
    captionSource: str | None = Column()
    captionTiming: str | None = Column()  # exact | estimated
    captionLanguage: str | None = Column()
    captionNote: str | None = Column()
    transcriptJson: str | None = Column()
    # AI analysis
    analysisStatus: str = Column(default="idle")
    analysisCount: int = Column(default=0)
    analysisFocus: str = Column(default="auto")
    # Picked on import: podcast | gaming | movies | sports | other. Chooses the AI engine (app/ai/engines.py).
    category: str = Column(default="other")
    analysisError: str | None = Column()
    analyzedAt: datetime | None = Column()
    summary: str | None = Column()

    clips: list[Clip] = relationship("Clip", local="id", remote="videoId", many=True)
    __table_args__ = (Index("Video_userId_createdAt_idx", "userId", "createdAt"),)


class Clip(Base, Serializable):
    __tablename__ = "Clip"
    id: str = _id()
    userId: str = _user_fk()
    videoId: str = Column(fk=("Video", "CASCADE"))
    createdAt: datetime = _created()
    updatedAt: datetime = _updated()
    title: str = Column()
    startSec: float = Column()
    endSec: float = Column()
    status: str = Column(default="idea")  # idea | draft | ready | published
    origin: str = Column(default="ai")  # ai | manual
    category: str | None = Column()
    momentLabel: str | None = Column()  # "Goal event", "Clutch play" ... from the category engine
    score: int | None = Column()
    scoreHook: int | None = Column()
    scoreSelf: int | None = Column()
    scorePayoff: int | None = Column()
    scoreQuote: int | None = Column()
    reason: str | None = Column()
    hook: str = Column(default="")
    caption: str = Column(default="")
    hashtags: str = Column(default="")
    notes: str = Column(default="")
    transcript: str = Column(default="")
    suggestionsJson: str | None = Column()

    video: Video = relationship("Video", local="videoId")
    posts: list[Post] = relationship("Post", local="id", remote="clipId", many=True)
    __table_args__ = (Index("Clip_userId_score_idx", "userId", "score"), Index("Clip_videoId_idx", "videoId"))


class SocialAccount(Base, Serializable):
    __tablename__ = "SocialAccount"
    id: str = _id()
    userId: str = _user_fk()
    platform: str = Column()
    externalId: str = Column()
    displayName: str = Column()
    username: str | None = Column()
    avatarUrl: str | None = Column()
    accessTokenEnc: str = Column()
    refreshTokenEnc: str | None = Column()
    tokenExpiresAt: datetime | None = Column()
    metaJson: str | None = Column()
    status: str = Column(default="active")  # active | expired | revoked
    createdAt: datetime = _created()
    updatedAt: datetime = _updated()
    __table_args__ = (UniqueConstraint("userId", "platform", "externalId", name="SocialAccount_userId_platform_externalId_key"),)


class Post(Base, Serializable):
    __tablename__ = "Post"
    id: str = _id()
    userId: str = _user_fk()
    clipId: str = Column(fk=("Clip", "CASCADE"))
    accountId: str | None = Column(fk=("SocialAccount", "SET NULL"))
    accountName: str = Column(default="")
    platform: str = Column()
    text: str = Column()
    status: str = Column(default="queued")
    scheduledAt: datetime | None = Column()
    publishedAt: datetime | None = Column()
    attempts: int = Column(default=0)
    externalId: str | None = Column()
    liveUrl: str | None = Column()
    error: str | None = Column()
    createdAt: datetime = _created()
    updatedAt: datetime = _updated()
    # YouTube uploads: resumable session (server-side only) and requested visibility
    uploadUrl: str | None = Column()
    uploadSize: int | None = Column()
    privacy: str | None = Column()
    # Live post stats
    views: int | None = Column()
    likes: int | None = Column()
    comments: int | None = Column()
    shares: int | None = Column()
    statsUpdatedAt: datetime | None = Column()

    clip: Clip = relationship("Clip", local="clipId")
    account: SocialAccount | None = relationship("SocialAccount", local="accountId")
    __table_args__ = (
        Index("Post_status_scheduledAt_idx", "status", "scheduledAt"),
        Index("Post_userId_createdAt_idx", "userId", "createdAt"),
    )


class OAuthState(Base):
    __tablename__ = "OAuthState"
    id: str = Column(primary_key=True)  # random state value
    userId: str = Column()
    platform: str = Column()
    verifier: str | None = Column()  # PKCE code verifier
    popup: bool = Column(default=False)
    createdAt: datetime = _created()


class IntegrationSetting(Base):
    """Developer-app credentials entered by an admin in the app (override environment variables)."""

    __tablename__ = "IntegrationSetting"
    id: str = Column(primary_key=True)  # meta | google
    clientId: str = Column()
    clientSecretEnc: str | None = Column()
    updatedAt: datetime = _updated()


class UsageEvent(Base):
    __tablename__ = "UsageEvent"
    id: str = _id()
    userId: str = _user_fk()
    kind: str = Column()
    createdAt: datetime = _created()
    __table_args__ = (Index("UsageEvent_userId_kind_createdAt_idx", "userId", "kind", "createdAt"),)


class Lead(Base, Serializable):
    __tablename__ = "Lead"
    id: str = _id()
    email: str = Column(unique=True)
    source: str = Column(default="landing-hero")
    utmSource: str | None = Column()
    utmMedium: str | None = Column()
    utmCampaign: str | None = Column()
    referrer: str | None = Column()
    userAgent: str | None = Column()
    createdAt: datetime = _created()
    updatedAt: datetime = _updated()
    signups: int = Column(default=1)


class ProcessedWebhook(Base):
    __tablename__ = "ProcessedWebhook"
    id: str = Column(primary_key=True)  # Stripe event id, for idempotency
    createdAt: datetime = _created()


class PasswordReset(Base):
    """A one-time password-reset link. Only a hash of the token is stored."""

    __tablename__ = "PasswordReset"
    id: str = _id()
    userId: str = _user_fk()
    tokenHash: str = Column(unique=True)
    expiresAt: datetime = Column()
    usedAt: datetime | None = Column()
    createdAt: datetime = _created()


class ContactMessage(Base, Serializable):
    """A message sent from the landing site's contact form."""

    __tablename__ = "ContactMessage"
    id: str = _id()
    name: str = Column()
    email: str = Column()
    topic: str = Column(default="general")
    message: str = Column()
    userAgent: str | None = Column()
    handled: bool = Column(default=False)
    createdAt: datetime = _created()
    __table_args__ = (Index("ContactMessage_createdAt_idx", "createdAt"),)


class AdminTotp(Base):
    """An admin's authenticator app (TOTP, RFC 6238) for the admin portal sign-in.

    `pendingSecretEnc` holds a replacement while it is being confirmed, so the current one keeps
    working until the new phone proves it has the secret. `lastStep` blocks replaying a used code.
    """

    __tablename__ = "AdminTotp"
    userId: str = Column(primary_key=True, fk=("User", "CASCADE"))
    secretEnc: str | None = Column()
    pendingSecretEnc: str | None = Column()
    enabledAt: datetime | None = Column()
    lastStep: int = Column(default=0)
    # Bumped when the authenticator is replaced: signs out every other portal session.
    sessionVersion: int = Column(default=0)
    updatedAt: datetime = _updated()


class AdminAudit(Base, Serializable):
    """Append-only record of what admins did in the portal (sign-ins, credit grants, suspensions)."""

    __tablename__ = "AdminAudit"
    id: str = _id()
    adminId: str | None = Column(fk=("User", "SET NULL"))
    adminEmail: str = Column()
    action: str = Column()
    targetUserId: str | None = Column(fk=("User", "SET NULL"))
    detail: str | None = Column()
    ip: str | None = Column()
    createdAt: datetime = _created()
    __table_args__ = (
        Index("AdminAudit_createdAt_idx", "createdAt"),
        Index("AdminAudit_targetUserId_createdAt_idx", "targetUserId", "createdAt"),
    )


class RevokedSession(Base):
    """App sessions ended by signing out. Kept until the token would have expired anyway."""

    __tablename__ = "RevokedSession"
    jti: str = Column(primary_key=True)
    expiresAt: datetime = Column()
    __table_args__ = (Index("RevokedSession_expiresAt_idx", "expiresAt"),)


class UserTwoFactor(Base):
    """Optional two-factor sign-in for app users, turned on in Settings (authenticator app, TOTP).

    `recoveryHashes` holds SHA-256 hashes of unused one-time backup codes, space-separated.
    """

    __tablename__ = "UserTwoFactor"
    userId: str = Column(primary_key=True, fk=("User", "CASCADE"))
    secretEnc: str | None = Column()
    pendingSecretEnc: str | None = Column()
    enabledAt: datetime | None = Column()
    lastStep: int = Column(default=0)
    recoveryHashes: str = Column(default="")


class Payment(Base, Serializable):
    """Money that moved through Stripe: plan invoices (new and renewal), credit packs, failures and refunds.

    `ref` is the Stripe invoice or checkout session id (unique: retried webhooks update, never duplicate);
    `paymentIntent` lets a refund find its payment. `live` is False for local test grants and backfilled
    history. `amountCents` is None when the amount wasn't recorded (purchases from before this table).
    """

    __tablename__ = "Payment"
    id: str = _id()
    userId: str | None = Column(fk=("User", "SET NULL"))
    email: str | None = Column()  # kept when the account is deleted
    kind: str = Column()  # plan | pack
    status: str = Column()  # paid | failed | refunded | partially_refunded
    amountCents: int | None = Column()
    refundedCents: int = Column(default=0)
    currency: str = Column(default="usd")
    description: str = Column()
    ref: str = Column(unique=True)
    paymentIntent: str | None = Column(index=True)
    live: bool = Column(default=True)
    tags: str = Column(default="")  # admin labels, comma-separated
    createdAt: datetime = _created()
    updatedAt: datetime = _updated()
    __table_args__ = (Index("Payment_createdAt_idx", "createdAt"), Index("Payment_userId_createdAt_idx", "userId", "createdAt"))


class AiUsage(Base):
    """One AI model request: which model, what for, the tokens Google billed, and the cost at the
    prices set in GEMINI_PRICES (None when no price is set for that model)."""

    __tablename__ = "AiUsage"
    id: str = _id()
    model: str = Column()
    purpose: str = Column()  # analysis | suggest | fetch
    inputTokens: int = Column(default=0)
    outputTokens: int = Column(default=0)  # includes thinking
    thinkingTokens: int = Column(default=0)
    cachedTokens: int = Column(default=0)
    costMicros: int | None = Column()  # US dollars × 1,000,000
    createdAt: datetime = _created()
    __table_args__ = (Index("AiUsage_createdAt_idx", "createdAt"),)
