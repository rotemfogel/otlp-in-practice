# Lab: Worker Logs - Auto-Instrumentation

### 🎯 Lab Goal

Configure the Python logging pipeline to export worker logs to the OTel Collector in OTLP format, forwarded to Loki. Once configured, every `logger.info()` / `logger.error()` call inside the worker will automatically include `trace_id` and `span_id` when executed within a traced operation.

### 📝 What You'll Learn

Python's standard `logging` module integrates with OTel via `LoggingHandler`. Adding this handler to the root logger redirects all log records through the OTel log pipeline — the same pattern as `WinstonInstrumentation` does for the frontend, but in Python.

### 📋 Tasks

**1. Update `src/instrumentation.py` — add the log pipeline**

Add imports for the log pipeline components at the top of `code/worker/src/instrumentation.py`:

```python
# Before (existing imports):
from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor

# After (add these imports):
from opentelemetry import metrics
from opentelemetry._logs import set_logger_provider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor
```

Then add the log pipeline block inside `setup_instrumentation()`, after the metrics setup:

```python
def setup_instrumentation() -> None:
    """Configure OpenTelemetry instrumentation pipeline."""
    resource = Resource({
        "service.name": os.getenv("OTEL_SERVICE_NAME", "translation-worker"),
    })

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4318")

    # --- Metrics pipeline (unchanged from previous lab) ---
    metric_reader = PeriodicExportingMetricReader(
        exporter=OTLPMetricExporter(endpoint=f"{otlp_endpoint}/v1/metrics"),
        export_interval_millis=int(os.getenv("OTEL_METRIC_EXPORT_INTERVAL_MS", "60000")),
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    # --- Logs pipeline (new) ---
    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(
            OTLPLogExporter(endpoint=f"{otlp_endpoint}/v1/logs")
        )
    )
    set_logger_provider(logger_provider)

    # Attach OTel handler to Python root logger.
    # This exports all log records via OTLP and injects trace_id/span_id automatically
    # when the log is emitted inside an active span.
    handler = LoggingHandler(logger_provider=logger_provider)
    logging.getLogger().addHandler(handler)

    # Auto-instrumentation (unchanged)
    RedisInstrumentor().instrument()
    SystemMetricsInstrumentor().instrument()

    logger.info("OpenTelemetry instrumentation initialised")
```

**2. Deploy**

```bash
cd compose/
docker compose -f compose.dev.yaml up --build worker
```

**3. Generate traffic**

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es"]}'
```

**4. Verify in Grafana Loki**

Open Grafana at http://localhost:3000 → Explore → Loki

Query:

```logql
{service_name="translation-worker"}
```

Expected log messages include:

- `OpenTelemetry instrumentation initialised`
- `Starting translation worker`
- `Worker ready, waiting for jobs...`
- `Processing job ...`

Once trace instrumentation is added in the next lab, log entries emitted within a span will also show `trace_id` and `span_id` as stream labels — enabling the same log-to-trace correlation links you set up in the single-system section.

### 🤖 AI Checkpoints

1. **LoggingHandler and Trace Context Injection:**

   Ask your AI assistant: "How does `LoggingHandler` in Python OTel automatically inject `trace_id` and `span_id` into log records? What is the equivalent mechanism in the Node.js frontend?"

   **What to evaluate:** Does it explain that `LoggingHandler` reads the currently active span context from OTel's context storage, extracts the trace and span IDs, and attaches them to the OTel log record before export? Does it describe `WinstonInstrumentation` as the Node.js equivalent, which hooks into Winston's log pipeline and injects context from the active span automatically? Does it note that both rely on the same OTel context propagation mechanism, so the pattern is language-agnostic?

2. **Logs Emitted Outside of a Span:**

   Ask: "What happens to log records emitted outside of any active span — for example, during service startup or in a background thread with no active trace context? How does OTel handle the missing trace and span IDs?"

   **What to evaluate:** Does it explain that OTel uses an invalid/zero trace context when no span is active, resulting in `trace_id` and `span_id` fields being set to all-zeros or omitted entirely? Does it mention that these logs are still exported to Loki but won't have clickable trace links in Grafana? Does it suggest emitting startup-related logs inside a root span to preserve full observability, or accepting that infrastructure-level logs are intrinsically untraced?

3. **Log Correlation vs. Distributed Tracing:**

   Ask: "We now have both logs (in Loki) and traces (in Tempo) for the worker, each carrying `trace_id`. When would you use log correlation to debug an issue versus going directly to the trace waterfall?"

   **What to evaluate:** Does it explain that log correlation is best for diagnosing the *content* of what happened (error messages, variable values, business logic) while trace waterfalls show the *timing and structure* of what happened across services? Does it mention that in practice you often start from a slow trace in Tempo, then jump to correlated logs in Loki to see the detailed error message? Does it discuss that logs can contain data too verbose for span attributes (e.g., full stack traces), making both signals complementary?

### 📚 Resources

- [Python OTel Logs SDK](https://opentelemetry.io/docs/languages/python/exporters/#otlp-logs)
- [LoggingHandler reference](https://opentelemetry-python.readthedocs.io/en/latest/sdk/logs.html)
