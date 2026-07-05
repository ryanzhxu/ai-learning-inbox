import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib.parse import urlparse, urlunparse

from openai import OpenAI
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from ai_learning_inbox.models import ActionItem, Analysis, Digest, Post, RawSubmission
from ai_learning_inbox.settings import settings


CONCEPT_MAP = {
    "agents": ["agent", "agents", "multi-agent", "multi agent"],
    "orchestration": ["orchestration", "workflow", "router", "planner"],
    "structured_outputs": ["structured output", "json schema", "function call", "tool call"],
    "evals": ["eval", "evaluation", "benchmark", "judge"],
    "memory": ["memory", "retrieval", "state", "context window"],
    "rag": ["rag", "retrieval augmented", "vector", "embedding"],
    "prompting": ["prompt", "prompting", "system prompt"],
    "automation": ["automation", "automate", "shortcut", "zapier", "n8n"],
    "api_tools": ["api", "tool", "webhook", "integration"],
}

TOOL_MAP = {
    "openai": ["openai", "gpt", "responses api"],
    "anthropic": ["anthropic", "claude"],
    "langgraph": ["langgraph"],
    "langchain": ["langchain"],
    "crewai": ["crewai"],
    "autogen": ["autogen"],
    "fastapi": ["fastapi"],
    "mcp": ["mcp", "model context protocol"],
    "n8n": ["n8n"],
    "zapier": ["zapier"],
}


@dataclass
class AnalysisResult:
    model_name: str
    summary: str
    main_claim: str
    why_it_matters: str
    concepts: list[str]
    tools: list[str]
    follow_up_questions: list[str]
    action_items: list[dict[str, Any]]
    actionability_score: float
    confidence_score: float

    def as_json(self) -> str:
        return json.dumps(
            {
                "model_name": self.model_name,
                "summary": self.summary,
                "main_claim": self.main_claim,
                "why_it_matters": self.why_it_matters,
                "concepts": self.concepts,
                "tools": self.tools,
                "follow_up_questions": self.follow_up_questions,
                "action_items": self.action_items,
                "actionability_score": self.actionability_score,
                "confidence_score": self.confidence_score,
            },
            ensure_ascii=False,
        )


def create_raw_submission(db: Session, payload: dict[str, Any]) -> RawSubmission:
    record = RawSubmission(
        source_platform=payload["source_platform"].strip().lower(),
        source_url=str(payload["source_url"]).strip(),
        payload_json=json.dumps(payload, ensure_ascii=False, default=str),
        shared_text=payload.get("shared_text"),
        user_note=payload.get("user_note"),
        capture_method=payload.get("capture_method", "shortcut"),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def process_pending_submissions(db: Session) -> dict[str, int]:
    pending = db.scalars(select(RawSubmission).where(RawSubmission.status == "pending").order_by(RawSubmission.received_at)).all()
    processed = 0
    failed = 0
    for raw in pending:
        try:
            post = normalize_submission(db, raw)
            create_analysis(db, post)
            raw.status = "processed"
            db.commit()
            processed += 1
        except Exception as exc:  # pragma: no cover
            raw.status = "failed"
            raw.error_message = str(exc)
            db.commit()
            failed += 1
    return {"processed": processed, "failed": failed}


def normalize_submission(db: Session, raw: RawSubmission) -> Post:
    if raw.post:
        return raw.post

    canonical_url = canonicalize_url(raw.source_url)
    body_text = (raw.shared_text or "").strip()
    user_note = (raw.user_note or "").strip()
    combined_text = "\n\n".join(part for part in [body_text, user_note] if part).strip()
    if not combined_text:
        combined_text = f"Saved post from {raw.source_platform}: {canonical_url}"

    post = Post(
        raw_submission_id=raw.id,
        platform=infer_platform(raw.source_platform, raw.source_url),
        canonical_url=canonical_url,
        external_post_id=extract_external_post_id(canonical_url),
        title=derive_title(body_text or user_note or canonical_url),
        body_text=body_text or user_note or "",
        combined_text=combined_text,
    )
    raw.processed_at = raw.processed_at or raw.received_at
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def create_analysis(db: Session, post: Post) -> Analysis:
    latest = db.scalars(
        select(Analysis)
        .where(Analysis.post_id == post.id, Analysis.prompt_version == settings.analysis_prompt_version)
        .order_by(desc(Analysis.analyzed_at))
    ).first()
    if latest:
        return latest

    result = analyze_text(post.combined_text, post.platform, post.canonical_url)
    analysis = Analysis(
        post_id=post.id,
        model_name=result.model_name,
        prompt_version=settings.analysis_prompt_version,
        summary=result.summary,
        main_claim=result.main_claim,
        why_it_matters=result.why_it_matters,
        concepts_json=json.dumps(result.concepts, ensure_ascii=False),
        tools_json=json.dumps(result.tools, ensure_ascii=False),
        actionability_score=result.actionability_score,
        confidence_score=result.confidence_score,
        follow_up_questions_json=json.dumps(result.follow_up_questions, ensure_ascii=False),
        analysis_json=result.as_json(),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    for idx, action in enumerate(result.action_items):
        db.add(
            ActionItem(
                analysis_id=analysis.id,
                title=action["title"],
                description=action["description"],
                action_type=action.get("action_type", "experiment"),
                difficulty=action.get("difficulty", "medium"),
                estimated_minutes=action.get("estimated_minutes", 30),
                position=idx,
            )
        )
    db.commit()
    db.refresh(analysis)
    return analysis


def analyze_text(text: str, platform: str, canonical_url: str) -> AnalysisResult:
    if settings.analysis_provider in {"auto", "openai"} and settings.openai_api_key:
        try:
            return analyze_with_openai(text, platform, canonical_url)
        except Exception:
            pass
    return analyze_with_heuristics(text, platform, canonical_url)


def analyze_with_openai(text: str, platform: str, canonical_url: str) -> AnalysisResult:
    client = OpenAI(api_key=settings.openai_api_key)
    prompt = f"""
You are analyzing a saved social post for private AI learning.
Return valid JSON only with keys:
summary, main_claim, why_it_matters, concepts, tools, follow_up_questions, action_items, actionability_score, confidence_score

Constraints:
- concepts: list of short strings
- tools: list of short strings
- follow_up_questions: list of 2 short questions
- action_items: list of 1 to 3 items with title, description, action_type, difficulty, estimated_minutes
- actionability_score and confidence_score: numbers from 0 to 1

Platform: {platform}
URL: {canonical_url}
Text:
{text}
""".strip()
    response = client.responses.create(model=settings.openai_model, input=prompt)
    payload = json.loads(response.output_text)
    return AnalysisResult(
        model_name=settings.openai_model,
        summary=payload["summary"],
        main_claim=payload["main_claim"],
        why_it_matters=payload["why_it_matters"],
        concepts=payload["concepts"],
        tools=payload["tools"],
        follow_up_questions=payload["follow_up_questions"],
        action_items=payload["action_items"],
        actionability_score=float(payload["actionability_score"]),
        confidence_score=float(payload["confidence_score"]),
    )


def analyze_with_heuristics(text: str, platform: str, canonical_url: str) -> AnalysisResult:
    cleaned = normalize_whitespace(text)
    lowered = cleaned.lower()
    concepts = [name for name, needles in CONCEPT_MAP.items() if any(needle in lowered for needle in needles)]
    tools = [name for name, needles in TOOL_MAP.items() if any(needle in lowered for needle in needles)]

    if not concepts:
        concepts = guess_concepts_from_text(lowered)

    summary = summarize_text(cleaned, platform)
    main_claim = first_sentence(cleaned) or f"This {platform} post shares an AI workflow or implementation idea."
    why_it_matters = build_why_it_matters(concepts)
    follow_up_questions = build_follow_up_questions(concepts)
    action_items = build_action_items(concepts, tools, canonical_url)
    actionability_score = min(1.0, 0.45 + (0.1 * len(concepts)) + (0.05 * len(tools)))
    confidence_score = min(0.95, 0.35 + min(len(cleaned), 400) / 800)

    return AnalysisResult(
        model_name="heuristic-v1",
        summary=summary,
        main_claim=main_claim,
        why_it_matters=why_it_matters,
        concepts=concepts,
        tools=tools,
        follow_up_questions=follow_up_questions,
        action_items=action_items,
        actionability_score=round(actionability_score, 2),
        confidence_score=round(confidence_score, 2),
    )


def build_digest_context(db: Session) -> dict[str, Any]:
    recent_posts = db.scalars(
        select(Post).options(joinedload(Post.analyses).joinedload(Analysis.action_items)).order_by(desc(Post.normalized_at)).limit(10)
    ).unique().all()
    processed_today = db.scalar(
        select(func.count(RawSubmission.id)).where(
            func.date(RawSubmission.received_at) == date.today().isoformat(),
            RawSubmission.status == "processed",
        )
    ) or 0
    pending = db.scalar(select(func.count(RawSubmission.id)).where(RawSubmission.status == "pending")) or 0
    all_analyses = db.scalars(select(Analysis)).all()
    concept_counts = Counter()
    for analysis in all_analyses:
        for concept in json.loads(analysis.concepts_json):
            concept_counts[concept] += 1
    top_themes = concept_counts.most_common(5)
    latest_digest = db.scalars(select(Digest).order_by(desc(Digest.created_at)).limit(1)).first()
    return {
        "recent_posts": recent_posts,
        "processed_today": processed_today,
        "pending": pending,
        "top_themes": top_themes,
        "latest_digest": latest_digest,
    }


def create_digest(db: Session, limit: int = 12) -> Digest | None:
    analyses = db.scalars(
        select(Analysis).options(joinedload(Analysis.action_items)).order_by(desc(Analysis.analyzed_at)).limit(limit)
    ).unique().all()
    if not analyses:
        return None

    digest = build_digest(analyses)
    record = Digest(
        summary=digest["summary"],
        priority_json=json.dumps(digest["priorities"], ensure_ascii=False),
        theme_json=json.dumps(digest["themes"], ensure_ascii=False),
        coverage_count=len(analyses),
        model_name=digest["model_name"],
        source_analysis_ids_json=json.dumps([analysis.id for analysis in analyses]),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def build_digest(analyses: list[Analysis]) -> dict[str, Any]:
    summaries = [analysis.summary.strip() for analysis in analyses if analysis.summary.strip()]
    themes = Counter()
    priorities: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    for analysis in analyses:
        for concept in json.loads(analysis.concepts_json):
            themes[concept] += 1
        for item in analysis.action_items:
            if item.title in seen_titles:
                continue
            priorities.append(
                {
                    "title": item.title,
                    "description": item.description,
                    "difficulty": item.difficulty,
                    "estimated_minutes": item.estimated_minutes,
                }
            )
            seen_titles.add(item.title)

    top_themes = [theme for theme, _count in themes.most_common(4)]
    if settings.analysis_provider in {"auto", "openai"} and settings.openai_api_key:
        try:
            return build_digest_with_openai(summaries, priorities, top_themes)
        except Exception:
            pass

    theme_phrase = ", ".join(top_themes) if top_themes else "applied AI"
    summary = (
        f"Recent saves cluster around {theme_phrase}. "
        f"The best next step is to turn the recurring ideas into a few small experiments instead of collecting more posts first."
    )
    return {
        "summary": summary,
        "priorities": priorities[:5],
        "themes": top_themes,
        "model_name": "heuristic-digest-v1",
    }


def build_digest_with_openai(
    summaries: list[str],
    priorities: list[dict[str, Any]],
    top_themes: list[str],
) -> dict[str, Any]:
    client = OpenAI(api_key=settings.openai_api_key)
    prompt = f"""
You are creating a short private learning digest from saved AI social posts.
Return valid JSON only with keys: summary, priorities, themes.

Constraints:
- summary: 2 to 4 sentences
- priorities: list of up to 5 items, each with title, description, difficulty, estimated_minutes
- themes: list of up to 4 short strings

Themes:
{json.dumps(top_themes, ensure_ascii=False)}

Candidate actions:
{json.dumps(priorities, ensure_ascii=False)}

Post summaries:
{json.dumps(summaries, ensure_ascii=False)}
""".strip()
    response = client.responses.create(model=settings.openai_model, input=prompt)
    payload = json.loads(response.output_text)
    return {
        "summary": payload["summary"],
        "priorities": payload["priorities"],
        "themes": payload["themes"],
        "model_name": settings.openai_model,
    }


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url)
    clean = parsed._replace(query="", fragment="")
    return urlunparse(clean)


def infer_platform(source_platform: str, url: str) -> str:
    normalized = source_platform.lower().strip()
    if normalized:
        return normalized
    host = urlparse(url).netloc.lower()
    if "threads.net" in host:
        return "threads"
    if "instagram.com" in host:
        return "instagram"
    if "x.com" in host or "twitter.com" in host:
        return "x"
    if "xiaohongshu" in host or "xhslink" in host:
        return "rednote"
    return "web"


def extract_external_post_id(url: str) -> str | None:
    path_parts = [part for part in urlparse(url).path.split("/") if part]
    return path_parts[-1] if path_parts else None


def derive_title(text: str) -> str | None:
    candidate = first_sentence(normalize_whitespace(text))
    if not candidate:
        return None
    return candidate[:120]


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def first_sentence(text: str) -> str:
    if not text:
        return ""
    parts = re.split(r"(?<=[.!?。！？])\s+", text.strip(), maxsplit=1)
    return parts[0].strip()


def summarize_text(text: str, platform: str) -> str:
    if not text:
        return f"This saved {platform} post has no text yet, so it needs manual enrichment before deeper analysis."
    if len(text) <= 220:
        return text
    return f"{text[:217].rstrip()}..."


def guess_concepts_from_text(text: str) -> list[str]:
    concept_guesses = []
    if "llm" in text or "model" in text:
        concept_guesses.append("llm_workflows")
    if "tool" in text or "api" in text:
        concept_guesses.append("api_tools")
    if "test" in text or "measure" in text:
        concept_guesses.append("evals")
    if not concept_guesses:
        concept_guesses.append("applied_ai")
    return concept_guesses


def build_why_it_matters(concepts: list[str]) -> str:
    if "evals" in concepts:
        return "This is useful because evaluation turns vague AI ideas into something you can compare, trust, and improve."
    if "agents" in concepts or "orchestration" in concepts:
        return "This matters because execution patterns usually determine whether an AI workflow is reliable in real work, not just impressive in demos."
    if "structured_outputs" in concepts:
        return "This matters because structured outputs make AI behaviour easier to validate and integrate into software."
    return "This matters because it can be translated into a small experiment instead of staying as passive inspiration."


def build_follow_up_questions(concepts: list[str]) -> list[str]:
    if "agents" in concepts:
        return [
            "What single-agent version of this idea can I compare against first?",
            "Where would this workflow fail without a human review step?",
        ]
    if "evals" in concepts:
        return [
            "What metric would tell me this approach is actually better?",
            "Can I create a tiny benchmark from my own tasks this week?",
        ]
    return [
        "What is the smallest version of this idea I can build in under 30 minutes?",
        "How would I know whether this post is describing something genuinely useful versus hype?",
    ]


def build_action_items(concepts: list[str], tools: list[str], canonical_url: str) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    if "structured_outputs" in concepts:
        actions.append(
            {
                "title": "Try one structured output endpoint",
                "description": "Build a tiny endpoint that asks a model for JSON and validate the response against a schema.",
                "difficulty": "easy",
                "estimated_minutes": 30,
            }
        )
    if "agents" in concepts or "orchestration" in concepts:
        actions.append(
            {
                "title": "Compare single-agent and multi-step flow",
                "description": "Take one small task and compare a direct prompt against a planner plus executor workflow.",
                "difficulty": "medium",
                "estimated_minutes": 45,
            }
        )
    if "evals" in concepts:
        actions.append(
            {
                "title": "Create a tiny eval set",
                "description": "Write 5 realistic prompts and score quality before and after changing the workflow described in the post.",
                "difficulty": "medium",
                "estimated_minutes": 40,
            }
        )
    if not actions:
        actions.append(
            {
                "title": "Recreate the idea in a toy script",
                "description": f"Use the post at {canonical_url} as inspiration and rebuild the smallest version in code so you can judge whether it is real or just framing.",
                "difficulty": "easy",
                "estimated_minutes": 25,
            }
        )
    if tools:
        actions.append(
            {
                "title": "Check one referenced tool hands-on",
                "description": f"Pick one mentioned tool ({tools[0]}) and spend 20 minutes verifying what problem it solves in practice.",
                "difficulty": "easy",
                "estimated_minutes": 20,
            }
        )
    return actions[:3]
