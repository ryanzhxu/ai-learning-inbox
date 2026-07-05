import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload

from ai_learning_inbox.db import get_db, init_db
from ai_learning_inbox.models import Analysis, Digest, Post, RawSubmission
from ai_learning_inbox.schemas import IngestRequest
from ai_learning_inbox.services import build_digest_context, create_digest, create_raw_submission, process_pending_submissions
from ai_learning_inbox.settings import settings


templates = Jinja2Templates(directory="src/ai_learning_inbox/templates")
templates.env.filters["from_json"] = json.loads


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

    @app.get("/health")
    def health(db: Session = Depends(get_db)) -> dict[str, str | int]:
        total = db.query(RawSubmission).count()
        return {"status": "ok", "app": settings.app_name, "raw_submissions": total}

    @app.get("/", response_class=HTMLResponse)
    def dashboard(request: Request, db: Session = Depends(get_db)) -> HTMLResponse:
        recent = db.scalars(
            select(Post).options(joinedload(Post.analyses).joinedload(Analysis.action_items)).order_by(desc(Post.normalized_at)).limit(12)
        ).unique().all()
        raw_count = db.query(RawSubmission).count()
        context = build_digest_context(db)
        context.update(
            {
                "request": request,
                "recent": recent,
                "raw_count": raw_count,
                "analysis_provider": "openai" if settings.openai_api_key else "heuristic fallback",
            }
        )
        return templates.TemplateResponse(request, "index.html", context)

    @app.post("/ingest/share")
    def ingest_share(payload: IngestRequest, db: Session = Depends(get_db)) -> dict[str, int | str]:
        record = create_raw_submission(db, payload.model_dump(mode="json"))
        return {"status": "accepted", "submission_id": record.id}

    @app.post("/capture")
    def manual_capture(
        source_platform: str = Form(...),
        source_url: str = Form(...),
        shared_text: str = Form(""),
        user_note: str = Form(""),
        db: Session = Depends(get_db),
    ) -> RedirectResponse:
        payload = IngestRequest(
            source_platform=source_platform,
            source_url=source_url,
            shared_text=shared_text or None,
            user_note=user_note or None,
            capture_method="manual",
        )
        create_raw_submission(db, payload.model_dump(mode="json"))
        return RedirectResponse(url="/", status_code=303)

    @app.post("/admin/process")
    def process_now(db: Session = Depends(get_db)) -> RedirectResponse:
        process_pending_submissions(db)
        return RedirectResponse(url="/", status_code=303)

    @app.post("/admin/digest")
    def build_digest_now(db: Session = Depends(get_db)) -> RedirectResponse:
        create_digest(db)
        return RedirectResponse(url="/digests/latest", status_code=303)

    @app.get("/posts", response_class=HTMLResponse)
    def list_posts(request: Request, db: Session = Depends(get_db)) -> HTMLResponse:
        posts = db.scalars(
            select(Post).options(joinedload(Post.analyses).joinedload(Analysis.action_items)).order_by(desc(Post.normalized_at))
        ).unique().all()
        return templates.TemplateResponse(request, "posts.html", {"request": request, "posts": posts})

    @app.get("/digests/latest", response_class=HTMLResponse)
    def latest_digest(request: Request, db: Session = Depends(get_db)) -> HTMLResponse:
        digest = db.scalars(select(Digest).order_by(desc(Digest.created_at)).limit(1)).first()
        priorities = json.loads(digest.priority_json) if digest else []
        themes = json.loads(digest.theme_json) if digest else []
        return templates.TemplateResponse(
            request,
            "digest_detail.html",
            {"request": request, "digest": digest, "priorities": priorities, "themes": themes},
        )

    @app.get("/posts/{post_id}", response_class=HTMLResponse)
    def post_detail(post_id: int, request: Request, db: Session = Depends(get_db)) -> HTMLResponse:
        post = db.scalars(
            select(Post).where(Post.id == post_id).options(joinedload(Post.analyses).joinedload(Analysis.action_items))
        ).unique().first()
        latest_analysis = post.analyses[-1] if post and post.analyses else None
        concepts = json.loads(latest_analysis.concepts_json) if latest_analysis else []
        tools = json.loads(latest_analysis.tools_json) if latest_analysis else []
        questions = json.loads(latest_analysis.follow_up_questions_json) if latest_analysis else []
        return templates.TemplateResponse(
            request,
            "post_detail.html",
            {
                "request": request,
                "post": post,
                "analysis": latest_analysis,
                "concepts": concepts,
                "tools": tools,
                "questions": questions,
            },
        )

    return app


app = create_app()
