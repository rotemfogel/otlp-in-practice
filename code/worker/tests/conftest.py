import pytest
from unittest.mock import Mock, patch, MagicMock
from src.config import Config


@pytest.fixture
def config():
    """Create a test configuration."""
    return Config(
        redis_host="localhost",
        redis_port=6379,
        queue_key="test:queue",
        result_channel="test:results",
        source_language="en",
        supported_languages=["es", "fr", "de"],
        log_level="INFO",
    )


@pytest.fixture
def sample_job():
    """Create a sample translation job."""
    return {
        "jobId": "job-123",
        "sessionId": "session-456",
        "text": "Hello, world!",
        "sourceLanguage": "en",
        "targetLanguage": "es",
        "createdAt": "2026-02-17T10:00:00Z",
    }


@pytest.fixture
def mock_redis():
    """Create a mock Redis client."""
    with patch("redis.Redis") as mock:
        redis_instance = MagicMock()
        mock.return_value = redis_instance
        yield redis_instance
