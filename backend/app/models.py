"""Data model. Table and column names match the existing database, so current data keeps working.

SQLite for local development; set DATABASE_URL to a Postgres URL for production
(every type used here is portable between the two).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime, new_id, utcnow


def _id() -> Mapped[str]:
    return mapped_column(String, primary_key=True, default=new_id)


def _created() -> Mapped[datetime]:
    return mapped_column(UTCDateTime, nullable=False, default=utcnow)


def _updated() -> Mapped[datetime]:
    return mapped_column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)


def _user_fk() -> Mapped[str]:
    return mapped_column(String, ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)


class Serializable:
    """`to_dict()` returns the row with its column names, as the API has always sent them."""

    def to_dict(self, exclude: tuple[str, ...] = ()) -> dict[str, Any]:
        return {c.key: getattr(self, c.key) for c in self.__table__.columns if c.key not in exclude}  # type: ignore[attr-defined]


class User(Base, Serializable):
    __tablename__ = "User"
    id: Mapped[str] = _id()
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String)
    passwordHash: Mapped[str] = mapped_column(String, nullable=False)
    createdAt: Mapped[datetime] = _created()
    updatedAt: Mapped[datetime] = _updated()
    # Billing (Stripe)
    stripeCustomerId: Mapped[str | None] = mapped_column(String, unique=True)
    stripeSubscriptionId: Mapped[str | None] = mapped_column(String, unique=True)
    plan: Mapped[str] = mapped_column(String, nullable=False, default="none")  # none | creator | pro | studio
    subscriptionStatus: Mapped[str] = mapped_column(String, nullable=False, default="none")
    currentPeriodEnd: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancelAtPeriodEnd: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Credits: the free trial is granted once.
    trialStartedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Bumped on password change/reset so every other session is signed out.
    sessionVersion: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Set by an admin in the portal: the account can't sign in until it is lifted.
    suspendedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    suspendedReason: Mapped[str | None] = mapped_column(String)


class CreditGrant(Base, Serializable):
    """A batch of credits from one source. Spending draws from the soonest-expiring grants first."""

    __tablename__ = "CreditGrant"
    id: Mapped[str] = _id()
    userId: Mapped[str] = _user_fk()
    source: Mapped[str] = mapped_column(String, nullable=False)  # trial | plan | pack | admin
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining: Mapped[int] = mapped_column(Integer, nullable=False)
    expiresAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ref: Mapped[str | None] = mapped_column(String, unique=True)  # Stripe invoice / session id, for idempotency
    createdAt: Mapped[datetime] = _created()
    __table_args__ = (Index("CreditGrant_userId_expiresAt_idx", "userId", "expiresAt"),)


class CreditTransaction(Base, Serializable):
    """Append-only history of every credit movement shown to the user."""

    __tablename__ = "CreditTransaction"
    id: Mapped[str] = _id()
    userId: Mapped[str] = _user_fk()
    delta: Mapped[int] = mapped_column(Integer, nullable=False)  # positive = added, negative = spent
    kind: Mapped[str] = mapped_column(String, nullable=False)  # grant | spend | refund
    description: Mapped[str] = mapped_column(String, nullable=False)
    videoId: Mapped[str | None] = mapped_column(String)
    allocJson: Mapped[str | None] = mapped_column(String)  # spend: [{grantId, amount}] for refunds
    refundedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    createdAt: Mapped[datetime] = _created()
    __table_args__ = (Index("CreditTransaction_userId_createdAt_idx", "userId", "createdAt"),)


class Video(Base, Serializable):
    __tablename__ = "Video"
    id: Mapped[str] = _id()
    userId: Mapped[str] = _user_fk()
    sourceUrl: Mapped[str] = mapped_column(String, nullable=False)
    platform: Mapped[str] = mapped_column(String, nullable=False)  # youtube | vimeo | direct
    externalId: Mapped[str | None] = mapped_column(String)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False, default="")
    author: Mapped[str | None] = mapped_column(String)
    durationSec: Mapped[float | None] = mapped_column(Float)
    thumbnailUrl: Mapped[str | None] = mapped_column(String)
    createdAt: Mapped[datetime] = _created()
    updatedAt: Mapped[datetime] = _updated()
    # Captions / transcript
    captionStatus: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    captionSource: Mapped[str | None] = mapped_column(String)
    captionTiming: Mapped[str | None] = mapped_column(String)  # exact | estimated
    captionLanguage: Mapped[str | None] = mapped_column(String)
    captionNote: Mapped[str | None] = mapped_column(String)
    transcriptJson: Mapped[str | None] = mapped_column(Text)
    # AI analysis
    analysisStatus: Mapped[str] = mapped_column(String, nullable=False, default="idle")
    analysisCount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    analysisFocus: Mapped[str] = mapped_column(String, nullable=False, default="auto")
    # Picked on import: podcast | gaming | movies | sports | other. Chooses the AI engine (app/ai/engines.py).
    category: Mapped[str] = mapped_column(String, nullable=False, default="other", server_default="other")
    analysisError: Mapped[str | None] = mapped_column(String)
    analyzedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    summary: Mapped[str | None] = mapped_column(String)

    clips: Mapped[list[Clip]] = relationship(back_populates="video", passive_deletes=True)
    __table_args__ = (Index("Video_userId_createdAt_idx", "userId", "createdAt"),)


class Clip(Base, Serializable):
    __tablename__ = "Clip"
    id: Mapped[str] = _id()
    userId: Mapped[str] = _user_fk()
    videoId: Mapped[str] = mapped_column(String, ForeignKey("Video.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    createdAt: Mapped[datetime] = _created()
    updatedAt: Mapped[datetime] = _updated()
    title: Mapped[str] = mapped_column(String, nullable=False)
    startSec: Mapped[float] = mapped_column(Float, nullable=False)
    endSec: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="idea")  # idea | draft | ready | published
    origin: Mapped[str] = mapped_column(String, nullable=False, default="ai")  # ai | manual
    category: Mapped[str | None] = mapped_column(String)
    momentLabel: Mapped[str | None] = mapped_column(String)  # "Goal event", "Clutch play" ... from the category engine
    score: Mapped[int | None] = mapped_column(Integer)
    scoreHook: Mapped[int | None] = mapped_column(Integer)
    scoreSelf: Mapped[int | None] = mapped_column(Integer)
    scorePayoff: Mapped[int | None] = mapped_column(Integer)
    scoreQuote: Mapped[int | None] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(String)
    hook: Mapped[str] = mapped_column(String, nullable=False, default="")
    caption: Mapped[str] = mapped_column(String, nullable=False, default="")
    hashtags: Mapped[str] = mapped_column(String, nullable=False, default="")
    notes: Mapped[str] = mapped_column(String, nullable=False, default="")
    transcript: Mapped[str] = mapped_column(String, nullable=False, default="")
    suggestionsJson: Mapped[str | None] = mapped_column(String)

    video: Mapped[Video] = relationship(back_populates="clips")
    posts: Mapped[list[Post]] = relationship(back_populates="clip", passive_deletes=True)
    __table_args__ = (Index("Clip_userId_score_idx", "userId", "score"), Index("Clip_videoId_idx", "videoId"))


class SocialAccount(Base, Serializable):
    __tablename__ = "SocialAccount"
    id: Mapped[str] = _id()
    userId: Mapped[str] = _user_fk()
    platform: Mapped[str] = mapped_column(String, nullable=False)
    externalId: Mapped[str] = mapped_column(String, nullable=False)
    displayName: Mapped[str] = mapped_column(String, nullable=False)
    username: Mapped[str | None] = mapped_column(String)
    avatarUrl: Mapped[str | None] = mapped_column(String)
    accessTokenEnc: Mapped[str] = mapped_column(String, nullable=False)
    refreshTokenEnc: Mapped[str | None] = mapped_column(String)
    tokenExpiresAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    metaJson: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")  # active | expired | revoked
    createdAt: Mapped[datetime] = _created()
    updatedAt: Mapped[datetime] = _updated()
    __table_args__ = (UniqueConstraint("userId", "platform", "externalId", name="SocialAccount_userId_platform_externalId_key"),)


class Post(Base, Serializable):
    __tablename__ = "Post"
    id: Mapped[str] = _id()
    userId: Mapped[str] = _user_fk()
    clipId: Mapped[str] = mapped_column(String, ForeignKey("Clip.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    accountId: Mapped[str | None] = mapped_column(String, ForeignKey("SocialAccount.id", ondelete="SET NULL", onupdate="CASCADE"))
    accountName: Mapped[str] = mapped_column(String, nullable=False, default="")
    platform: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="queued")
    scheduledAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    publishedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    externalId: Mapped[str | None] = mapped_column(String)
    liveUrl: Mapped[str | None] = mapped_column(String)
    error: Mapped[str | None] = mapped_column(String)
    createdAt: Mapped[datetime] = _created()
    updatedAt: Mapped[datetime] = _updated()
    # YouTube uploads: resumable session (server-side only) and requested visibility
    uploadUrl: Mapped[str | None] = mapped_column(String)
    uploadSize: Mapped[int | None] = mapped_column(Integer)
    privacy: Mapped[str | None] = mapped_column(String)
    # Live post stats
    views: Mapped[int | None] = mapped_column(Integer)
    likes: Mapped[int | None] = mapped_column(Integer)
    comments: Mapped[int | None] = mapped_column(Integer)
    shares: Mapped[int | None] = mapped_column(Integer)
    statsUpdatedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)

    clip: Mapped[Clip] = relationship(back_populates="posts")
    account: Mapped[SocialAccount | None] = relationship()
    __table_args__ = (
        Index("Post_status_scheduledAt_idx", "status", "scheduledAt"),
        Index("Post_userId_createdAt_idx", "userId", "createdAt"),
    )


class OAuthState(Base):
    __tablename__ = "OAuthState"
    id: Mapped[str] = mapped_column(String, primary_key=True)  # random state value
    userId: Mapped[str] = mapped_column(String, nullable=False)
    platform: Mapped[str] = mapped_column(String, nullable=False)
    verifier: Mapped[str | None] = mapped_column(String)  # PKCE code verifier
    popup: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    createdAt: Mapped[datetime] = _created()


class IntegrationSetting(Base):
    """Developer-app credentials entered by an admin in the app (override environment variables)."""

    __tablename__ = "IntegrationSetting"
    id: Mapped[str] = mapped_column(String, primary_key=True)  # meta | google
    clientId: Mapped[str] = mapped_column(String, nullable=False)
    clientSecretEnc: Mapped[str | None] = mapped_column(String)
    updatedAt: Mapped[datetime] = _updated()


class UsageEvent(Base):
    __tablename__ = "UsageEvent"
    id: Mapped[str] = _id()
    userId: Mapped[str] = _user_fk()
    kind: Mapped[str] = mapped_column(String, nullable=False)
    createdAt: Mapped[datetime] = _created()
    __table_args__ = (Index("UsageEvent_userId_kind_createdAt_idx", "userId", "kind", "createdAt"),)


class Lead(Base, Serializable):
    __tablename__ = "Lead"
    id: Mapped[str] = _id()
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False, default="landing-hero")
    utmSource: Mapped[str | None] = mapped_column(String)
    utmMedium: Mapped[str | None] = mapped_column(String)
    utmCampaign: Mapped[str | None] = mapped_column(String)
    referrer: Mapped[str | None] = mapped_column(String)
    userAgent: Mapped[str | None] = mapped_column(String)
    createdAt: Mapped[datetime] = _created()
    updatedAt: Mapped[datetime] = _updated()
    signups: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ProcessedWebhook(Base):
    __tablename__ = "ProcessedWebhook"
    id: Mapped[str] = mapped_column(String, primary_key=True)  # Stripe event id, for idempotency
    createdAt: Mapped[datetime] = _created()


class PasswordReset(Base):
    """A one-time password-reset link. Only a hash of the token is stored."""

    __tablename__ = "PasswordReset"
    id: Mapped[str] = _id()
    userId: Mapped[str] = _user_fk()
    tokenHash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    expiresAt: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    usedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    createdAt: Mapped[datetime] = _created()


class ContactMessage(Base, Serializable):
    """A message sent from the landing site's contact form."""

    __tablename__ = "ContactMessage"
    id: Mapped[str] = _id()
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    topic: Mapped[str] = mapped_column(String, nullable=False, default="general")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    userAgent: Mapped[str | None] = mapped_column(String)
    handled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    createdAt: Mapped[datetime] = _created()
    __table_args__ = (Index("ContactMessage_createdAt_idx", "createdAt"),)


class AdminTotp(Base):
    """An admin's authenticator app (TOTP, RFC 6238) for the admin portal sign-in.

    `pendingSecretEnc` holds a replacement while it is being confirmed, so the current one keeps
    working until the new phone proves it has the secret. `lastStep` blocks replaying a used code.
    """

    __tablename__ = "AdminTotp"
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True)
    secretEnc: Mapped[str | None] = mapped_column(String)
    pendingSecretEnc: Mapped[str | None] = mapped_column(String)
    enabledAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    lastStep: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Bumped when the authenticator is replaced: signs out every other portal session.
    sessionVersion: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updatedAt: Mapped[datetime] = _updated()


class AdminAudit(Base, Serializable):
    """Append-only record of what admins did in the portal (sign-ins, credit grants, suspensions)."""

    __tablename__ = "AdminAudit"
    id: Mapped[str] = _id()
    adminId: Mapped[str | None] = mapped_column(String, ForeignKey("User.id", ondelete="SET NULL", onupdate="CASCADE"))
    adminEmail: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    targetUserId: Mapped[str | None] = mapped_column(String, ForeignKey("User.id", ondelete="SET NULL", onupdate="CASCADE"))
    detail: Mapped[str | None] = mapped_column(String)
    ip: Mapped[str | None] = mapped_column(String)
    createdAt: Mapped[datetime] = _created()
    __table_args__ = (
        Index("AdminAudit_createdAt_idx", "createdAt"),
        Index("AdminAudit_targetUserId_createdAt_idx", "targetUserId", "createdAt"),
    )


class RevokedSession(Base):
    """App sessions ended by signing out. Kept until the token would have expired anyway."""

    __tablename__ = "RevokedSession"
    jti: Mapped[str] = mapped_column(String, primary_key=True)
    expiresAt: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    __table_args__ = (Index("RevokedSession_expiresAt_idx", "expiresAt"),)


class UserTwoFactor(Base):
    """Optional two-factor sign-in for app users, turned on in Settings (authenticator app, TOTP).

    `recoveryHashes` holds SHA-256 hashes of unused one-time backup codes, space-separated.
    """

    __tablename__ = "UserTwoFactor"
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True)
    secretEnc: Mapped[str | None] = mapped_column(String)
    pendingSecretEnc: Mapped[str | None] = mapped_column(String)
    enabledAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    lastStep: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    recoveryHashes: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
