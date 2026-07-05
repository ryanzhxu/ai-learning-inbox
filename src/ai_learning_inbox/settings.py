from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Learning Inbox"
    app_env: str = "development"
    debug: bool = False
    database_url: str = "sqlite:///./data/ai_learning_inbox.db"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    analysis_provider: str = "auto"
    analysis_prompt_version: str = "v1"

    model_config = SettingsConfigDict(
        env_prefix="AILI_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def data_dir(self) -> Path:
        if self.database_url.startswith("sqlite:///./"):
            relative = self.database_url.removeprefix("sqlite:///./")
            return Path(relative).resolve().parent
        return Path("./data").resolve()


settings = Settings()
