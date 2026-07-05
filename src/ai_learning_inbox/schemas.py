from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


class IngestRequest(BaseModel):
    source_platform: str = Field(min_length=1, max_length=50)
    source_url: HttpUrl
    shared_text: str | None = None
    user_note: str | None = None
    capture_method: str = "shortcut"
    shared_at: datetime | None = None


class ManualCaptureRequest(BaseModel):
    source_platform: str
    source_url: HttpUrl
    shared_text: str | None = None
    user_note: str | None = None
    capture_method: str = "manual"
