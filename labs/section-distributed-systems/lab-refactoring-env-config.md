# Lab: Refactoring - Environment-Driven Configuration

### 🎯 Lab Goal

Eliminate every hardcoded value from both services so that all runtime configuration — including OTel collector endpoints, service names, Redis coordinates, and supported languages — can be supplied purely through environment variables. This makes both services portable across any deployment environment (Compose, Kubernetes, CI) without code changes.

### 📝 What You'll Learn

- Why hardcoded values in application code are incompatible with multi-environment deployments
- How the Node.js OTel SDK reads standard environment variables (`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`) automatically — and why overriding them in code defeats the purpose
- How to make Python dataclass configuration fully env-driven

### 📋 Tasks

---

**1. Review the OTel configuration in `frontend/src/instrumentation.ts`**

Open `code/frontend/src/instrumentation.ts`. The file has already been updated to remove all hardcoded OTel values — review it to understand how the Node.js OTel SDK reads standard environment variables automatically when no explicit value is provided.

The file should look like this:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

// All configuration is driven by standard OTel environment variables:
//   OTEL_SERVICE_NAME                   — service name (required)
//   OTEL_EXPORTER_OTLP_ENDPOINT         — base URL for all signals, e.g. http://otel-collector:4318
//   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT  — override traces endpoint
//   OTEL_EXPORTER_OTLP_METRICS_ENDPOINT — override metrics endpoint
//   OTEL_EXPORTER_OTLP_LOGS_ENDPOINT    — override logs endpoint
//   OTEL_METRIC_EXPORT_INTERVAL         — metrics export interval in ms (default 60000)
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: parseInt(
      process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000',
      10,
    ),
  }),
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
  instrumentations: [
    getNodeAutoInstrumentations(),
    new WinstonInstrumentation(),
  ],
});

sdk.start();
```

The standard environment variables automatically handled by the SDK are:

| Environment variable                  | What it controls                       |
| ------------------------------------- | -------------------------------------- |
| `OTEL_SERVICE_NAME`                   | Service name attached to all telemetry |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | Base URL for all three OTLP exporters  |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | Traces-specific override               |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Metrics-specific override              |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`    | Logs-specific override                 |
| `OTEL_METRIC_EXPORT_INTERVAL`         | Metric export interval in ms           |

> **Why keep `exportIntervalMillis` explicit?** The `PeriodicExportingMetricReader` constructor does not currently read `OTEL_METRIC_EXPORT_INTERVAL` automatically in all SDK versions, so we read it explicitly with a default of 60000ms. Everything else — `serviceName`, all OTLP URLs — is handled by the SDK.

> **Why does removing `serviceName` from code matter?** If `serviceName: 'translation-frontend'` is set explicitly in the `NodeSDK` constructor, it silently overrides `OTEL_SERVICE_NAME` regardless of what Kubernetes injects at runtime. Removing the hardcoded value ensures the environment variable always takes effect.

---

**2. Fix the log level in `frontend/src/logger.ts`**

The logger hardcodes `level: 'info'`, ignoring the `LOG_LEVEL` environment variable that is already set in the Compose file:

```typescript
// Before:
export const logger = winston.createLogger({
  level: 'info',
  // ...
});

// After:
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL?.toLowerCase() || 'info',
  // ...
});
```

---

**3. Move hardcoded queue config to env vars in `worker/src/config.py`**

The worker's `Config` class already reads most values from the environment, but three are hardcoded:

```python
# Before:
return cls(
    redis_host=os.getenv("REDIS_HOST", "localhost"),
    redis_port=int(os.getenv("REDIS_PORT", "6379")),
    queue_key="translation:queue",           # ← hardcoded
    result_channel="translation:results",    # ← hardcoded
    source_language=os.getenv("SOURCE_LANGUAGE", "en"),
    supported_languages=["es", "fr", "de"],  # ← hardcoded
    log_level=os.getenv("LOG_LEVEL", "info").upper(),
)

# After:
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
```

`SUPPORTED_LANGUAGES` accepts a comma-separated list: `es,fr,de` or `es,fr,de,ja,zh`.

---

### 🔑 Environment Variable Reference

After this lab, every runtime value in both services is configurable via env vars:

**Frontend:**

| Variable                      | Default      | Purpose                       |
| ----------------------------- | ------------ | ----------------------------- |
| `OTEL_SERVICE_NAME`           | _(required)_ | Service name in all telemetry |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(required)_ | OTel Collector base URL       |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000`      | Metric flush interval (ms)    |
| `REDIS_HOST`                  | `localhost`  | Redis hostname                |
| `REDIS_PORT`                  | `6379`       | Redis port                    |
| `PORT`                        | `3000`       | HTTP server port              |
| `LOG_LEVEL`                   | `info`       | Winston log level             |

**Worker:**

| Variable                      | Default                      | Purpose                           |
| ----------------------------- | ---------------------------- | --------------------------------- |
| `OTEL_SERVICE_NAME`           | `translation-worker`         | Service name in all telemetry     |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` | OTel Collector base URL           |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000`                      | Metric flush interval (ms)        |
| `REDIS_HOST`                  | `localhost`                  | Redis hostname                    |
| `REDIS_PORT`                  | `6379`                       | Redis port                        |
| `QUEUE_KEY`                   | `translation:queue`          | Redis list key for jobs           |
| `RESULT_CHANNEL`              | `translation:results`        | Redis pub/sub channel for results |
| `SOURCE_LANGUAGE`             | `en`                         | Source language code              |
| `SUPPORTED_LANGUAGES`         | `es,fr,de`                   | Comma-separated target languages  |
| `LOG_LEVEL`                   | `info`                       | Python log level                  |
