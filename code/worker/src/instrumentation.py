import os
import logging

from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor

from opentelemetry._logs import set_logger_provider
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter

from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

logger = logging.getLogger(__name__)


def setup_instrumentation() -> None:
    """Configure OpenTelemetry metrics pipeline."""
    resource = Resource.create()

    metric_reader = PeriodicExportingMetricReader(
        exporter=OTLPMetricExporter(),
        export_interval_millis=int(os.getenv("OTEL_METRIC_EXPORT_INTERVAL", "10000")),
    )

    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[metric_reader],
    )
    metrics.set_meter_provider(meter_provider)

    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))

    set_logger_provider(logger_provider)

    # Attach OTel handler to Python root logger.
    # This exports all log records via OTLP and injects trace_id/span_id automatically
    # when the log is emitted inside an active span.
    handler = LoggingHandler(logger_provider=logger_provider)
    logging.getLogger().addHandler(handler)

    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(tracer_provider)

    # Auto-instrument Redis client — patches redis-py to create spans for every Redis command.
    # Note: the Python RedisInstrumentor produces traces only, not metrics.
    RedisInstrumentor().instrument()  # type: ignore

    # Auto-collect system and process metrics: CPU, memory, network I/O, GC counts.
    SystemMetricsInstrumentor().instrument()

    logger.info("OpenTelemetry instrumentation initialised")
