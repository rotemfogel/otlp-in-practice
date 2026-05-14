import pytest
from unittest.mock import MagicMock, patch, call
from src.main import main
import time


@patch("src.main.Translator")
@patch("src.main.QueueConsumer")
@patch("src.main.Config")
def test_main_processes_job_successfully(
    mock_config_class, mock_queue_class, mock_translator_class
):
    """Test main loop processes a job successfully."""
    # Setup config
    mock_config = MagicMock()
    mock_config.redis_host = "localhost"
    mock_config.redis_port = 6379
    mock_config.queue_key = "test:queue"
    mock_config.result_channel = "test:results"
    mock_config.source_language = "en"
    mock_config.supported_languages = ["es", "fr"]
    mock_config.log_level = "INFO"
    mock_config_class.from_env.return_value = mock_config

    # Setup queue consumer
    mock_queue = MagicMock()
    job = {
        "jobId": "job-123",
        "sessionId": "session-456",
        "text": "Hello",
        "sourceLanguage": "en",
        "targetLanguage": "es",
    }
    # Return job once, then trigger shutdown
    mock_queue.wait_for_job.side_effect = [job, KeyboardInterrupt()]
    mock_queue_class.return_value = mock_queue

    # Setup translator
    mock_translator = MagicMock()
    mock_translator.translate.return_value = "Hola"
    mock_translator_class.return_value = mock_translator

    # Run main (should exit on KeyboardInterrupt)
    try:
        main()
    except KeyboardInterrupt:
        pass

    # Verify
    mock_queue.connect.assert_called_once()
    mock_translator.translate.assert_called_once_with("Hello", "en", "es")
    mock_queue.publish_result.assert_called_once()

    # Check published result
    published_result = mock_queue.publish_result.call_args[0][0]
    assert published_result["jobId"] == "job-123"
    assert published_result["status"] == "completed"
    assert published_result["translatedText"] == "Hola"


@patch("src.main.Translator")
@patch("src.main.QueueConsumer")
@patch("src.main.Config")
def test_main_handles_translation_error(
    mock_config_class, mock_queue_class, mock_translator_class
):
    """Test main loop handles translation errors."""
    # Setup config
    mock_config = MagicMock()
    mock_config.redis_host = "localhost"
    mock_config.redis_port = 6379
    mock_config.queue_key = "test:queue"
    mock_config.result_channel = "test:results"
    mock_config.source_language = "en"
    mock_config.supported_languages = ["es", "fr"]
    mock_config.log_level = "INFO"
    mock_config_class.from_env.return_value = mock_config

    # Setup queue consumer
    mock_queue = MagicMock()
    job = {
        "jobId": "job-123",
        "sessionId": "session-456",
        "text": "Hello",
        "sourceLanguage": "en",
        "targetLanguage": "es",
    }
    mock_queue.wait_for_job.side_effect = [job, KeyboardInterrupt()]
    mock_queue_class.return_value = mock_queue

    # Setup translator to raise error
    mock_translator = MagicMock()
    mock_translator.translate.side_effect = RuntimeError("Translation failed")
    mock_translator_class.return_value = mock_translator

    # Run main
    try:
        main()
    except KeyboardInterrupt:
        pass

    # Verify error result was published
    mock_queue.publish_result.assert_called_once()
    published_result = mock_queue.publish_result.call_args[0][0]
    assert published_result["jobId"] == "job-123"
    assert published_result["status"] == "error"
    assert "Translation failed" in published_result["error"]


@patch("src.main.Translator")
@patch("src.main.QueueConsumer")
@patch("src.main.Config")
def test_main_handles_unsupported_language(
    mock_config_class, mock_queue_class, mock_translator_class
):
    """Test main loop handles unsupported language."""
    # Setup config
    mock_config = MagicMock()
    mock_config.redis_host = "localhost"
    mock_config.redis_port = 6379
    mock_config.queue_key = "test:queue"
    mock_config.result_channel = "test:results"
    mock_config.source_language = "en"
    mock_config.supported_languages = ["es", "fr"]
    mock_config.log_level = "INFO"
    mock_config_class.from_env.return_value = mock_config

    # Setup queue consumer
    mock_queue = MagicMock()
    job = {
        "jobId": "job-123",
        "sessionId": "session-456",
        "text": "Hello",
        "sourceLanguage": "en",
        "targetLanguage": "xx",  # Unsupported
    }
    mock_queue.wait_for_job.side_effect = [job, KeyboardInterrupt()]
    mock_queue_class.return_value = mock_queue

    # Setup translator
    mock_translator = MagicMock()
    mock_translator_class.return_value = mock_translator

    # Run main
    try:
        main()
    except KeyboardInterrupt:
        pass

    # Verify error result was published without calling translator
    mock_translator.translate.assert_not_called()
    mock_queue.publish_result.assert_called_once()
    published_result = mock_queue.publish_result.call_args[0][0]
    assert published_result["status"] == "error"
    assert "Unsupported" in published_result["error"]


@patch("src.main.Translator")
@patch("src.main.QueueConsumer")
@patch("src.main.Config")
def test_main_disconnects_on_shutdown(
    mock_config_class, mock_queue_class, mock_translator_class
):
    """Test main loop disconnects properly on shutdown."""
    # Setup config
    mock_config = MagicMock()
    mock_config.redis_host = "localhost"
    mock_config.redis_port = 6379
    mock_config.queue_key = "test:queue"
    mock_config.result_channel = "test:results"
    mock_config.source_language = "en"
    mock_config.supported_languages = ["es"]
    mock_config.log_level = "INFO"
    mock_config_class.from_env.return_value = mock_config

    # Setup queue consumer
    mock_queue = MagicMock()
    mock_queue.wait_for_job.side_effect = KeyboardInterrupt()
    mock_queue_class.return_value = mock_queue

    # Setup translator
    mock_translator = MagicMock()
    mock_translator_class.return_value = mock_translator

    # Run main
    try:
        main()
    except KeyboardInterrupt:
        pass

    # Verify cleanup
    mock_queue.disconnect.assert_called_once()
