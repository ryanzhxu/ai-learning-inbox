from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ai_learning_inbox.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RawSubmission(Base):
    __tablename__ = "raw_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_platform: Mapped[str] = mapped_column(String(50))
    source_url: Mapped[str] = mapped_column(Text)
    payload_json: Mapped[str] = mapped_column(Text)
    shared_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    capture_method: Mapped[str] = mapped_column(String(50), default="shortcut")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    post: Mapped["Post | None"] = relationship(back_populates="raw_submission", uselist=False)


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    raw_submission_id: Mapped[int] = mapped_column(ForeignKey("raw_submissions.id"), unique=True)
    platform: Mapped[str] = mapped_column(String(50))
    canonical_url: Mapped[str] = mapped_column(Text)
    external_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body_text: Mapped[str] = mapped_column(Text, default="")
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    combined_text: Mapped[str] = mapped_column(Text, default="")
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    normalized_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    raw_submission: Mapped[RawSubmission] = relationship(back_populates="post")
    analyses: Mapped[list["Analysis"]] = relationship(back_populates="post", order_by="Analysis.analyzed_at")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"))
    model_name: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column(String(50))
    summary: Mapped[str] = mapped_column(Text)
    main_claim: Mapped[str] = mapped_column(Text)
    why_it_matters: Mapped[str] = mapped_column(Text)
    concepts_json: Mapped[str] = mapped_column(Text)
    tools_json: Mapped[str] = mapped_column(Text)
    actionability_score: Mapped[float] = mapped_column(Float)
    confidence_score: Mapped[float] = mapped_column(Float)
    follow_up_questions_json: Mapped[str] = mapped_column(Text)
    analysis_json: Mapped[str] = mapped_column(Text)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    post: Mapped[Post] = relationship(back_populates="analyses")
    action_items: Mapped[list["ActionItem"]] = relationship(back_populates="analysis", order_by="ActionItem.position")


class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    action_type: Mapped[str] = mapped_column(String(50), default="experiment")
    difficulty: Mapped[str] = mapped_column(String(30), default="medium")
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(20), default="open")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    analysis: Mapped[Analysis] = relationship(back_populates="action_items")


class Digest(Base):
    __tablename__ = "digests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    summary: Mapped[str] = mapped_column(Text)
    priority_json: Mapped[str] = mapped_column(Text)
    theme_json: Mapped[str] = mapped_column(Text)
    coverage_count: Mapped[int] = mapped_column(Integer, default=0)
    model_name: Mapped[str] = mapped_column(String(100))
    source_analysis_ids_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
