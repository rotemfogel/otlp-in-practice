# Lab: Worker Metrics - Auto-Instrumentation

### 🎯 Lab Goal

Install the OpenTelemetry Python SDK in the translation worker and configure automatic metric collection. `SystemMetricsInstrumentor` will automatically collect CPU, memory, and process metrics that appear in Prometheus. This lab also sets up the `MeterProvider` pipeline infrastructure that custom business metrics (Lab 5) will use.

### 📝 What You'll Learn

The OTel Python SDK wires up the same metrics pipeline you built in the frontend, but for Python. `SystemMetricsInstrumentor` automatically collects system and process-level metrics (CPU, memory, network I/O, GC). Note that `RedisInstrumentor` is also added here but produces **traces only**: automatic Redis _metrics_ are not supported by the Python SDK. Business-level metrics (job throughput, latency, queue wait time) will be added later during manual instrumentation.

### 📋 Tasks

**1. Add OpenTelemetry packages to `pyproject.toml`**

Open `code/worker/pyproject.toml` and add the OTel dependencies:

```toml
[project]
name = "translation-worker"
version = "1.0.0"
description = "Translation queue worker service"
requires-python = ">=3.11"
dependencies = [
    "redis==7.2.0",
    "argostranslate==1.11.0",
    "opentelemetry-api==1.40.0",
    "opentelemetry-sdk==1.40.0",
    "opentelemetry-exporter-otlp-proto-http==1.40.0",
    "opentelemetry-instrumentation-redis==0.61b0",
    "opentelemetry-instrumentation-system-metrics==0.61b0",
]
```

**2. Create `src/instrumentation.py`**

Create a new file `code/worker/src/instrumentation.py`:

```python
"""OpenTelemetry instrumentation setup for the translation worker."""
import os
import logging

from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor

logger = logging.getLogger(__name__)


def setup_instrumentation() -> None:
    """Configure OpenTelemetry metrics pipeline."""
    resource = Resource({
        "service.name": os.getenv("OTEL_SERVICE_NAME", "translation-worker"),
    })

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4318")

    metric_reader = PeriodicExportingMetricReader(
        exporter=OTLPMetricExporter(
            endpoint=f"{otlp_endpoint}/v1/metrics",
        ),
        export_interval_millis=int(os.getenv("OTEL_METRIC_EXPORT_INTERVAL_MS", "60000")),
    )

    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[metric_reader],
    )
    metrics.set_meter_provider(meter_provider)

    # Auto-instrument Redis client — patches redis-py to create spans for every Redis command.
    # Note: the Python RedisInstrumentor produces traces only, not metrics.
    # Business metrics will be added manually in Lab 5.
    RedisInstrumentor().instrument()

    # Auto-collect system and process metrics: CPU, memory, network I/O, GC counts.
    SystemMetricsInstrumentor().instrument()

    logger.info("OpenTelemetry instrumentation initialised")
```

**3. Update `src/main.py` to initialise instrumentation**

Add the instrumentation call at the start of `main()`, before any other setup:

```python
# Before:
from .config import Config
from .queue import QueueConsumer
from .translator import Translator

# After (add the import):
from .config import Config
from .queue import QueueConsumer
from .translator import Translator
from .instrumentation import setup_instrumentation
```

Then call it at the very beginning of `main()`:

```python
def main() -> None:
    """Main worker loop."""
    global shutdown_flag

    # Register signal handlers
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    # Initialise OpenTelemetry before anything else
    setup_instrumentation()

    # Load configuration
    config = Config.from_env()
    # ... rest of function unchanged
```

**4. Add OTel environment variables to `compose/compose.app.yaml`**

Add `OTEL_SERVICE_NAME` and `OTEL_EXPORTER_OTLP_ENDPOINT` to the worker service:

```yaml
worker:
  container_name: worker
  environment:
    - REDIS_HOST=redis
    - REDIS_PORT=6379
    - LOG_LEVEL=info
    - SOURCE_LANGUAGE=en
    - OTEL_SERVICE_NAME=translation-worker
    - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

**5. Rebuild and deploy the worker**

```bash
cd compose/
docker compose -f compose.dev.yaml up --build worker
```

The `--build` flag is required because new Python packages were added to `pyproject.toml`.

**6. Generate traffic**

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es", "fr"]}'
```

**7. Verify metrics in Prometheus**

Open Prometheus at http://localhost:9090 and run:

```promql
system_cpu_time_seconds_total{exported_job="translation-worker"}
```

Also try:

```promql
process_runtime_cpython_memory_bytes{exported_job="translation-worker"}
```

Expected: series labelled `exported_job="translation-worker"` with non-zero values.

Also verify the worker appears in the Prometheus targets list at http://localhost:9090/targets (it exports via the OTel Collector scrape endpoint).

> **Note:** `RedisInstrumentor` produces _traces_ (visible in Tempo), not metrics. Business-level metrics such as job throughput and translation latency are added in Lab 5.

### 🤖 AI Checkpoints

1. **SystemMetricsInstrumentor vs. RedisInstrumentor:**

   Ask your AI assistant: "What metrics does `SystemMetricsInstrumentor` collect automatically in Python OpenTelemetry? How does this differ from what `RedisInstrumentor` produces?"

   **What to evaluate:** Does it explain that `SystemMetricsInstrumentor` uses `psutil` to collect system and process-level metrics — CPU time/utilization, memory usage, network I/O, disk I/O, and Python GC counts? Does it clarify that `RedisInstrumentor`, by contrast, produces only *traces* (spans per Redis command) and has no metrics implementation in the Python SDK, unlike its Java or Node.js counterparts? Does it explain why both instrumentors are useful in combination?

2. **Export Intervals and Trade-offs:**

   Ask: "In this lab, we use `PeriodicExportingMetricReader` to push metrics to the OTel Collector. What are the trade-offs of choosing a longer vs. a shorter export interval? How does the export interval relate to Prometheus' scrape interval?"

   **What to evaluate:** Does it explain that a shorter interval (e.g., 5s) gives more granular data but increases network overhead and exporter CPU usage? Does it mention that a longer interval (e.g., 60s) reduces overhead but can miss short-lived spikes? Does it explain that the export interval and Prometheus scrape interval are independent — Prometheus scrapes the Collector endpoint at its own cadence, and the Collector buffers incoming OTLP metrics in between?

3. **Why Infrastructure Before Business Metrics:**

   Ask: "In this lab, we set up the `MeterProvider` pipeline and collect only system metrics, leaving business metrics for the next lab. Why is it important to establish the pipeline infrastructure first rather than adding all instrumentation in one step?"

   **What to evaluate:** Does it explain that the `MeterProvider` must be configured and set as the global provider *before* any `meter.create_counter()` or similar calls execute, otherwise those instruments write to a no-op provider and silently drop data? Does it mention that separating infrastructure setup from business instrumentation follows the single-responsibility principle and makes each lab independently testable? Does it note that verifying the pipeline end-to-end with auto-instrumented metrics first reduces debugging surface area when custom metrics are added later?

### 📚 Resources

- [OpenTelemetry Python SDK](https://opentelemetry.io/docs/languages/python/)
- [opentelemetry-instrumentation-redis](https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/redis/redis.html)
- [Python MeterProvider configuration](https://opentelemetry.io/docs/languages/python/exporters/#otlp-metrics)
