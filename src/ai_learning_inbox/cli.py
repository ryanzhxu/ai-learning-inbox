import argparse

import uvicorn
from sqlalchemy.orm import Session

from ai_learning_inbox.app import app
from ai_learning_inbox.db import SessionLocal, init_db
from ai_learning_inbox.services import create_digest, process_pending_submissions


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Learning Inbox")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve = subparsers.add_parser("serve", help="Run the local web app")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true")

    subparsers.add_parser("init-db", help="Create the database tables")
    subparsers.add_parser("process-pending", help="Normalize and analyze pending submissions")
    subparsers.add_parser("generate-digest", help="Build a roll-up digest from recent analyzed posts")

    args = parser.parse_args()

    if args.command == "serve":
        init_db()
        uvicorn.run("ai_learning_inbox.app:app", host=args.host, port=args.port, reload=args.reload)
        return

    if args.command == "init-db":
        init_db()
        return

    if args.command == "process-pending":
        init_db()
        with SessionLocal() as db:  # type: Session
            process_pending_submissions(db)
        return

    if args.command == "generate-digest":
        init_db()
        with SessionLocal() as db:  # type: Session
            create_digest(db)
