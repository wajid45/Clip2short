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
