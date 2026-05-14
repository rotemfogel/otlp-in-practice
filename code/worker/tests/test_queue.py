import pytest
import json
from unittest.mock import MagicMock, patch
from src.queue import QueueConsumer


def test_queue_consumer_init(config):
    """Test QueueConsumer initialization."""
    consumer = QueueConsumer(
        host=config.redis_host,
        port=config.redis_port,
        queue_key=config.queue_key,
        result_channel=config.result_channel,
    )

    assert consumer.host == config.redis_host
    assert consumer.port == config.redis_port
    assert consumer.queue_key == config.queue_key
    assert consumer.result_channel == config.result_channel
    assert consumer.client is None
    assert consumer.publisher is None


def test_queue_consumer_connect(config, mock_redis):
    """Test connecting to Redis."""
    consumer = QueueConsumer(
        host=config.redis_host,
        port=config.redis_port,
        queue_key=config.queue_key,
        result_channel=config.result_channel,
    )

    consumer.connect()

    assert consumer.client is not None
    assert consumer.publisher is not None
    consumer.client.ping.assert_called()  # type: ignore
    consumer.publisher.ping.assert_called()  # type: ignore


def test_wait_for_job_success(config, mock_redis, sample_job):
    """Test successfully retrieving a job."""
    consumer = QueueConsumer(
        host=config.redis_host,
        port=config.redis_port,
        queue_key=config.queue_key,
        result_channel=config.result_channel,
    )
    consumer.connect()

    # Mock BRPOP returning a job
    job_json = json.dumps(sample_job)
    consumer.client.brpop.return_value = (config.queue_key, job_json)  # type: ignore

    result = consumer.wait_for_job(timeout=1)

    assert result is not None
    assert result["jobId"] == sample_job["jobId"]
    assert result["targetLanguage"] == sample_job["targetLanguage"]
    consumer.client.brpop.assert_called_once_with([config.queue_key], timeout=1)  # type: ignore


def test_wait_for_job_timeout(config, mock_redis):
    """Test timeout when waiting for job."""
    consumer = QueueConsumer(
        host=config.redis_host,
        port=config.redis_port,
        queue_key=config.queue_key,
        result_channel=config.result_channel,
    )
    consumer.connect()

    # Mock BRPOP returning None (timeout)
    consumer.client.brpop.return_value = None  # type: ignore

    result = consumer.wait_for_job(timeout=1)

    assert result is None


def test_wait_for_job_invalid_json(config, mock_redis):
    """Test handling invalid JSON."""
    consumer = QueueConsumer(
        host=config.redis_host,
        port=config.redis_port,
        queue_key=config.queue_key,
        result_channel=config.result_channel,
    )
    consumer.connect()

    # Mock BRPOP returning invalid JSON
    consumer.client.brpop.return_value = (config.queue_key, "invalid json")  # type: ignore

    result = consumer.wait_for_job(timeout=1)

    assert result is None


def test_publish_result_success(config, mock_redis):
    """Test successfully publishing a result."""
    consumer = QueueConsumer(
        host=config.redis_host,
        port=config.redis_port,
        queue_key=config.queue_key,
        result_channel=config.result_channel,
    )
    consumer.connect()

    result = {
        "jobId": "job-123",
        "sessionId": "session-456",
        "targetLanguage": "es",
        "translatedText": "Hola, mundo!",
        "status": "completed",
        "durationMs": 1500,
    }

    consumer.publish_result(result)

    consumer.publisher.publish.assert_called_once()  # type: ignore
    call_args = consumer.publisher.publish.call_args  # type: ignore
    assert call_args[0][0] == config.result_channel
    published_data = json.loads(call_args[0][1])
    assert published_data["jobId"] == result["jobId"]


def test_disconnect(config, mock_redis):
    """Test disconnecting from Redis."""
    consumer = QueueConsumer(
        host=config.redis_host,
        port=config.redis_port,
        queue_key=config.queue_key,
        result_channel=config.result_channel,
    )
    consumer.connect()

    # Save reference to mock before disconnect sets them to None
    client_mock = consumer.client

    consumer.disconnect()

    # Both client and publisher are the same mock in tests, so close is called twice
    assert client_mock.close.call_count == 2  # type: ignore
    assert consumer.client is None
    assert consumer.publisher is None
    assert consumer.client is None
    assert consumer.publisher is None
