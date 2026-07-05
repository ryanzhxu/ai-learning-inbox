from pathlib import Path
import sys

from fastapi.testclient import TestClient


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_PATH = PROJECT_ROOT / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))


def test_ingest_process_and_render(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("AILI_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")

    from ai_learning_inbox.app import create_app
    from ai_learning_inbox.db import init_db

    init_db()
    client = TestClient(create_app())

    ingest_response = client.post(
        "/ingest/share",
        json={
            "source_platform": "threads",
            "source_url": "https://www.threads.net/@demo/post/abc123?igshid=test",
            "shared_text": "A practical post about multi-agent orchestration, evals, and structured outputs for real workflows.",
            "user_note": "Seems worth trying in a toy backend.",
            "capture_method": "shortcut",
        },
    )
    assert ingest_response.status_code == 200
    assert ingest_response.json()["status"] == "accepted"

    process_response = client.post("/admin/process", follow_redirects=False)
    assert process_response.status_code == 303

    digest_response = client.post("/admin/digest", follow_redirects=False)
    assert digest_response.status_code == 303

    dashboard = client.get("/")
    assert dashboard.status_code == 200
    assert "multi-agent orchestration" in dashboard.text
    assert "Open full digest" in dashboard.text

    posts = client.get("/posts")
    assert posts.status_code == 200
    assert "structured outputs" in posts.text.lower()

    digest = client.get("/digests/latest")
    assert digest.status_code == 200
    assert "Priority actions" in digest.text
    assert "Compare single-agent and multi-step flow" in digest.text
