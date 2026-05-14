# Lab: Worker Traces - Auto-Instrumentation

### 🎯 Lab Goal

Add the trace pipeline to the worker's OTel setup, enabling Redis operations (BRPOP, PUBLISH) to appear as spans in Grafana Tempo. After this lab, Redis client calls will generate spans automatically — though they will be disconnected traces until context propagation is added in the next lab.

### 📝 What You'll Learn

A single call to `RedisInstrumentor().instrument()` covers all three signals once the respective providers are configured. Adding the `TracerProvider` to the instrumentation setup is enough for it to start producing Redis spans alongside the metrics and logs already configured.

### 📋 Tasks

**1. Update `src/instrumentation.py` — add the trace pipeline**

Add trace imports at the top of `code/worker/src/instrumentation.py`:

```python
# Add these imports alongside the existing ones:
from opentelemetry import metrics, trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
```

Then add the trace pipeline block inside `setup_instrumentation()`, after the logs setup:

```python
def setup_instrumentation() -> None:
    """Configure OpenTelemetry instrumentation pipeline."""
    resource = Resource({
        "service.name": os.getenv("OTEL_SERVICE_NAME", "translation-worker"),
    })

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4318")

    # --- Metrics pipeline (unchanged) ---
    metric_reader = PeriodicExportingMetricReader(
        exporter=OTLPMetricExporter(endpoint=f"{otlp_endpoint}/v1/metrics"),
        export_interval_millis=int(os.getenv("OTEL_METRIC_EXPORT_INTERVAL_MS", "60000")),
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    # --- Logs pipeline (unchanged) ---
    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(OTLPLogExporter(endpoint=f"{otlp_endpoint}/v1/logs"))
    )
    set_logger_provider(logger_provider)
    logging.getLogger().addHandler(LoggingHandler(logger_provider=logger_provider))

    # --- Traces pipeline (new) ---
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=f"{otlp_endpoint}/v1/traces")
        )
    )
    trace.set_tracer_provider(tracer_provider)

    # Auto-instrumentation — now covers metrics, logs, AND traces
    RedisInstrumentor().instrument()
    SystemMetricsInstrumentor().instrument()

    logger.info("OpenTelemetry instrumentation initialised")
```

> **Why does the trace pipeline enable Redis spans automatically?**
> `RedisInstrumentor().instrument()` checks for a configured `TracerProvider` when patching the Redis client. Now that a real provider is set, every Redis command creates a span.

**2. Deploy**

```bash
cd compose/
docker compose -f compose.dev.yaml up --build worker
```

**3. Generate traffic**

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es", "fr"]}'
```

**4. Verify Redis spans in Grafana Tempo**

Open Grafana at http://localhost:3000 → Explore → Tempo → Search

Filter by `service.name = translation-worker`.

Expected spans:

- `BRPOP` — blocking read from the queue
- `PUBLISH` — publishing the result to the results channel

**Span attributes to examine:**

- `db.system: redis`
- `db.operation: BRPOP` or `PUBLISH`
- `net.peer.name: redis`
- `net.peer.port: 6379`

> **Note:** At this point the worker spans appear as isolated traces — they are not connected to the corresponding frontend `create_translation_session` span. This is the problem context propagation solves in the next lab.

### 🤖 AI Checkpoints

1. **Why Worker Spans Appear Isolated:**

   Ask your AI assistant: "Why do the worker Redis spans appear as isolated traces rather than children of the frontend's `create_translation_session` span? What information is missing, and what mechanism would fix this?"

   **What to evaluate:** Does it explain that distributed trace continuity requires trace context (trace ID + parent span ID) to be explicitly passed across the service boundary? Does it explain that Redis messages have no built-in headers like HTTP requests, so the frontend must inject the W3C `traceparent` value into the job payload? Does it note that the worker must then extract that context and use it as the remote parent when creating its root span — and that this is exactly what the context propagation lab implements next?

2. **What RedisInstrumentor Captures Automatically:**

   Ask: "What span attributes does `RedisInstrumentor` attach to the spans it generates automatically? How can you use those attributes in Tempo to distinguish between, for example, a `BRPOP` (job dequeue) and a `PUBLISH` (result publish) operation?"

   **What to evaluate:** Does it list standard attributes like `db.system: redis`, `db.operation`, `db.statement` (the full Redis command), `net.peer.name`, and `net.peer.port`? Does it explain that filtering traces by `db.operation` in Tempo's search allows you to isolate specific Redis command types? Does it note that `db.statement` can expose sensitive data and should often be disabled in production via the instrumentor's configuration?

3. **Limits of Auto-Instrumentation:**

   Ask: "Auto-instrumentation tells us *which* Redis commands were executed and *how long* they took, but not *why* they were executed or *what business operation* they belong to. How would you add semantic business context to auto-generated spans without duplicating them?"

   **What to evaluate:** Does it explain that you can enrich auto-generated spans by adding custom attributes to the *current span* (`trace.get_current_span().set_attribute(...)`) from within the surrounding business logic? Does it mention that this avoids creating a redundant wrapper span? Does it note that adding a `translation.job_id` or `translation.session_id` attribute to an auto-generated Redis span is a practical example of combining auto and manual instrumentation?

### 📚 Resources

- [Python OTel Traces SDK](https://opentelemetry.io/docs/languages/python/exporters/#otlp-traces)
- [Redis instrumentation spans](https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/redis/redis.html)
