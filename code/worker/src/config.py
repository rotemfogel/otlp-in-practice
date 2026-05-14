import os
from dataclasses import dataclass
from typing import List


@dataclass
class Config:
    """Configuration for the translation worker."""

    redis_host: str
    redis_port: int
    queue_key: str
    result_channel: str
    source_language: str
    supported_languages: List[str]
    log_level: str

    @classmethod
    def from_env(cls) -> "Config":
        """Create configuration from environment variables."""

        supported_languages_raw = os.getenv("SUPPORTED_LANGUAGES", "es,fr,de")
        supported_languages = [l.strip() for l in supported_languages_raw.split(",") if l.strip()]

        return cls(
            redis_host=os.getenv("REDIS_HOST", "localhost"),
            redis_port=int(os.getenv("REDIS_PORT", "6379")),
            queue_key=os.getenv("QUEUE_KEY", "translation:queue"),
            result_channel=os.getenv("RESULT_CHANNEL", "translation:results"),
            source_language=os.getenv("SOURCE_LANGUAGE", "en"),
            supported_languages=supported_languages,
            log_level=os.getenv("LOG_LEVEL", "info").upper(),
        )
