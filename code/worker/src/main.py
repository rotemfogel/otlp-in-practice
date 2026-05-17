import signal
import sys
import logging
import time
import random
from datetime import datetime, timezone
from opentelemetry import trace, propagate
from opentelemetry.trace import SpanKind, StatusCode
from typing import Optional
from .config import Config
from .logger import setup_logging
from .consumer_queue import ConsumerQueue
from .translator import Translator
from .instrumentation import setup_instrumentation
from .metrics import jobs_total, translation_duration, active_jobs

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

# Global shutdown flag
shutdown_flag = False


def handle_shutdown(signum: int, frame) -> None:
    """Handle shutdown signals gracefully."""
    global shutdown_flag
    logger.info("Received shutdown signal", extra={"signal": signum})
    shutdown_flag = True


def inject_trace_context(result) -> None:
    trace_context: dict = {}
    propagate.inject(trace_context)
    result["_traceContext"] = trace_context


def main() -> None:
    """Main worker loop."""
    global shutdown_flag

    # Register signal handlers
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    # Load configuration
    config = Config.from_env()

    setup_logging(config.log_level)
    setup_instrumentation()

    logger.info("Starting translation worker")
    logger.info("Redis connection config", extra={"redis_host": config.redis_host, "redis_port": config.redis_port})
    logger.info("Supported languages", extra={"languages": config.supported_languages})

    # Initialize components
    queue_consumer: Optional[ConsumerQueue] = None
    translator: Optional[Translator] = None

    try:
        # Connect to Redis
        queue_consumer = ConsumerQueue(
            host=config.redis_host,
            port=config.redis_port,
            queue_key=config.queue_key,
            result_channel=config.result_channel,
        )
        queue_consumer.connect()

        # Initialize translator
        logger.info("Initializing translator...")
        translator = Translator()
        logger.info("Translator ready")

        # Main loop
        logger.info("Worker ready, waiting for jobs...")
        while not shutdown_flag:
            try:
                # Wait for job with timeout to allow checking shutdown flag
                job = queue_consumer.wait_for_job(timeout=1)

                if job is None:
                    continue

                # Extract job details
                job_id = job.get("jobId", "")
                session_id = job.get("sessionId", "")
                text = job.get("text")
                source_lang = job.get("sourceLanguage", config.source_language)
                target_lang = job.get("targetLanguage", "")

                if not all([job_id, session_id, text, target_lang]):
                    logger.error("Invalid job data received", extra={"job": job})
                    continue

                # Extract remote trace context from the job payload.
                # propagate.extract() reads the W3C traceparent value injected by the frontend.
                # If "_traceContext" is absent or malformed, extract() returns a background context
                # — no exception is thrown. The worker will simply start a new root span instead of
                # a child span, so traces won't be connected but processing continues normally.
                remote_ctx = propagate.extract(job.get("_traceContext", {}))

                with tracer.start_as_current_span(
                    "process_translation_job",
                    context=remote_ctx,
                    kind=SpanKind.CONSUMER,
                    attributes={
                        "translation.job_id": job_id,
                        "translation.session_id": session_id,
                        "translation.target_language": target_lang,
                        "translation.text_length": len(text) if text else 0,
                    },
                ) as span:
                    start_time = time.time()
                    active_jobs.add(
                        1, attributes={"translation.target_language": target_lang}
                    )
                    # Validate target language
                    if target_lang not in config.supported_languages:
                        error_msg = f"Unsupported target language: {target_lang}"
                        span.set_status(trace.Status(StatusCode.ERROR, error_msg))
                        logger.error("Unsupported target language", extra={"target_language": target_lang})

                        result = {
                            "jobId": job_id,
                            "sessionId": session_id,
                            "targetLanguage": target_lang,
                            "status": "error",
                            "error": error_msg,
                            "durationMs": 0,
                            "completedAt": datetime.now(timezone.utc).isoformat() + "Z",
                        }

                        duration_ms = int((time.time() - start_time) * 1000)
                        translation_duration.record(
                            duration_ms,
                            attributes={
                                "translation.target_language": target_lang,
                                "translation.status": result.get("status", "unknown"),
                            },
                        )
                        jobs_total.add(
                            1,
                            attributes={
                                "translation.target_language": target_lang,
                                "translation.status": result.get("status", "unknown"),
                            },
                        )
                        inject_trace_context(result)
                        queue_consumer.publish_result(result)
                        continue

                    # Translate
                    logger.info(
                        "Processing translation job",
                        extra={"job_id": job_id, "source_language": source_lang, "target_language": target_lang},
                    )

                    try:
                        # Simulate realistic API latency (0.5-2 seconds)
                        delay = random.uniform(0.5, 2.0)
                        logger.debug("Simulating translation latency", extra={"delay_seconds": round(delay, 2)})
                        time.sleep(delay)

                        # Ensure text is not None (already validated above)
                        assert text is not None, "Text should not be None"
                        translated_text = translator.translate(
                            text, source_lang, target_lang
                        )
                        duration_ms = int((time.time() - start_time) * 1000)

                        span.set_attribute("translation.duration_ms", duration_ms)

                        result = {
                            "jobId": job_id,
                            "sessionId": session_id,
                            "targetLanguage": target_lang,
                            "translatedText": translated_text,
                            "status": "completed",
                            "durationMs": duration_ms,
                            "completedAt": datetime.now(timezone.utc).isoformat() + "Z",
                        }

                        logger.info(
                            "Translation job completed",
                            extra={"job_id": job_id, "duration_ms": duration_ms},
                        )

                    except Exception as e:
                        duration_ms = int((time.time() - start_time) * 1000)
                        error_msg = str(e)

                        logger.error(
                            "Translation failed",
                            extra={"job_id": job_id, "error": error_msg},
                        )

                        span.record_exception(e)
                        span.set_status(trace.Status(StatusCode.ERROR, error_msg))

                        result = {
                            "jobId": job_id,
                            "sessionId": session_id,
                            "targetLanguage": target_lang,
                            "status": "error",
                            "error": error_msg,
                            "durationMs": duration_ms,
                            "completedAt": datetime.now(timezone.utc).isoformat() + "Z",
                        }
                    finally:
                        active_jobs.add(
                            -1, attributes={"translation.target_language": target_lang}
                        )

                    translation_duration.record(
                        duration_ms,
                        attributes={
                            "translation.target_language": target_lang,
                            "translation.status": result.get("status", "unknown"),
                        },
                    )
                    jobs_total.add(
                        1,
                        attributes={
                            "translation.target_language": target_lang,
                            "translation.status": result.get("status", "unknown"),
                        },
                    )
                    # Publish result
                    inject_trace_context(result)
                    queue_consumer.publish_result(result)

            except KeyboardInterrupt:
                logger.info("Received keyboard interrupt")
                break
            except Exception as e:
                logger.error("Error processing job", extra={"error": str(e)}, exc_info=True)
                # Continue processing next job
                time.sleep(1)

        logger.info("Worker shutting down...")

    except Exception as e:
        logger.error("Fatal error", extra={"error": str(e)}, exc_info=True)
        sys.exit(1)

    finally:
        # Cleanup
        if queue_consumer:
            try:
                queue_consumer.disconnect()
            except Exception as e:
                logger.error("Error disconnecting from Redis", extra={"error": str(e)})

        logger.info("Worker stopped")


if __name__ == "__main__":
    main()
