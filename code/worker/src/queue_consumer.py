import redis
import json
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class QueueConsumer:
    """Redis queue consumer for translation jobs."""

    def __init__(self, host: str, port: int, queue_key: str, result_channel: str):
        self.host = host
        self.port = port
        self.queue_key = queue_key
        self.result_channel = result_channel
        self.client: Optional[redis.Redis] = None
        self.publisher: Optional[redis.Redis] = None

    def connect(self) -> None:
        """Connect to Redis."""
        try:
            # Client for blocking operations (BRPOP)
            self.client = redis.Redis(
                host=self.host,
                port=self.port,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_keepalive=True,
                health_check_interval=30,
            )

            # Separate client for publishing
            self.publisher = redis.Redis(
                host=self.host,
                port=self.port,
                decode_responses=True,
                socket_connect_timeout=5,
            )

            # Test connections
            self.client.ping()
            self.publisher.ping()

            logger.info("Connected to Redis", extra={"host": self.host, "port": self.port})
        except redis.RedisError as e:
            logger.error("Failed to connect to Redis", extra={"error": str(e)})
            raise

    def wait_for_job(self, timeout: int = 0) -> Optional[Dict[str, Any]]:
        """
        Wait for and retrieve a job from the queue.

        Args:
            timeout: Timeout in seconds (0 = block indefinitely)

        Returns:
            Job dictionary or None if timeout
        """
        if not self.client:
            raise RuntimeError("QueueConsumer not connected")

        try:
            result = self.client.brpop([self.queue_key], timeout=timeout)  # type: ignore

            if result is None:
                return None

            _, job_json = result  # type: ignore
            job = json.loads(job_json)

            logger.info(
                "Received job",
                extra={"job_id": job.get("jobId"), "target_language": job.get("targetLanguage")},
            )
            return job

        except json.JSONDecodeError as e:
            logger.error("Failed to parse job JSON", extra={"error": str(e)})
            return None
        except redis.RedisError as e:
            logger.error("Redis error while waiting for job", extra={"error": str(e)})
            raise

    def publish_result(self, result: Dict[str, Any]) -> None:
        """
        Publish a translation result.

        Args:
            result: Result dictionary
        """
        if not self.publisher:
            raise RuntimeError("QueueConsumer not connected")

        try:
            result_json = json.dumps(result)
            self.publisher.publish(self.result_channel, result_json)

            logger.info(
                "Published result",
                extra={"job_id": result.get("jobId"), "status": result.get("status")},
            )
        except (json.JSONDecodeError, redis.RedisError) as e:
            logger.error("Failed to publish result", extra={"error": str(e)})
            raise

    def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self.client:
            self.client.close()
            self.client = None

        if self.publisher:
            self.publisher.close()
            self.publisher = None

        logger.info("Disconnected from Redis")
