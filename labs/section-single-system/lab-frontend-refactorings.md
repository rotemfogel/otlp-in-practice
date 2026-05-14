# Lab: Frontend Instrumentation Refactoring

### 🎯 Lab Goal

Eliminate hardcoded configuration from `instrumentation.ts` by relying on standard OpenTelemetry environment variables, and move all OTel configuration into the compose file.

### 📝 What You'll Learn

Hardcoding service names and collector endpoints directly in code creates friction when deploying to different environments. OpenTelemetry's SDK reads a set of standard environment variables out of the box — moving configuration there makes the same image reusable across dev, staging, and production with no code changes.

**Key environment variables used in this lab:**

| Variable                      | Purpose                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `OTEL_SERVICE_NAME`           | Service name reported in all telemetry signals            |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL for all OTLP exporters (traces, metrics, logs)   |
| `OTEL_METRIC_EXPORT_INTERVAL` | Metrics export interval in milliseconds (default `60000`) |

### 📋 Tasks

**1. Review the Current `src/instrumentation.ts`**

Open `code/frontend/src/instrumentation.ts` and note the hardcoded values:

```typescript
const sdk = new NodeSDK({
  serviceName: 'translation-frontend', // ← hardcoded
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector:4318/v1/traces', // ← hardcoded
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://otel-collector:4318/v1/metrics', // ← hardcoded
    }),
    exportIntervalMillis: 10000, // ← hardcoded
  }),
  logRecordProcessors: [
    new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: 'http://otel-collector:4318/v1/logs', // ← hardcoded
      }),
    ),
  ],
  instrumentations: [
    getNodeAutoInstrumentations(),
    new WinstonInstrumentation(),
  ],
});
```

Every endpoint and the service name are baked into the code. Changing the collector address requires a code edit and a new image build.

---

**2. Refactor `src/instrumentation.ts`**

Replace the full file content with the version below. The OTel Node SDK automatically reads `OTEL_SERVICE_NAME` and `OTEL_EXPORTER_OTLP_ENDPOINT`, so no arguments need to be passed to any exporter or to `NodeSDK`:

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

What changed:

- `serviceName` removed — SDK reads `OTEL_SERVICE_NAME` from the environment
- `url` option removed from all exporters — SDK reads `OTEL_EXPORTER_OTLP_ENDPOINT` and appends the signal-specific path automatically (`/v1/traces`, `/v1/metrics`, `/v1/logs`)
- `exportIntervalMillis` now reads from `OTEL_METRIC_EXPORT_INTERVAL`, with a sensible default of `60000` ms

---

**3. Add OTel Environment Variables to `compose/compose.app.yaml`**

Open `compose/compose.app.yaml` and add the two OTel environment variables to the `frontend` and `worker` services:

```yaml
frontend:
  container_name: frontend
  ports:
    - '3001:3000'
  environment:
    - REDIS_HOST=redis
    - REDIS_PORT=6379
    - PORT=3000
    - LOG_LEVEL=info
    - SOURCE_LANGUAGE=en
    - OTEL_SERVICE_NAME=translation-frontend
    - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

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

This is the single place where environment-specific configuration lives. Swapping to a different collector (e.g. in a staging environment) is now a one-line change here rather than a code change.

---

**4. Deploy**

```bash
cd compose/
docker compose -f compose.dev.yaml up --build frontend
```

Note: To rebuild all services with hot-reload use `docker compose -f compose.dev.yaml up --build` instead.

**5. Verify Configuration Is Picked Up**

Check the frontend container logs for the service name being reported correctly:

```bash
docker logs frontend 2>&1 | head -20
```

Generate a request and verify signals still arrive in Grafana:

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es", "fr"]}'
```

Open Grafana (http://localhost:3000) and confirm:

- **Tempo** → traces tagged with `service.name = translation-frontend`
- **Prometheus** → metrics labelled `exported_job="translation-frontend"`
- **Loki** → logs with `service_name="translation-frontend"`

All three signals should appear identically to before the refactoring — this is a pure configuration change, not a behaviour change.

### 🤖 AI Checkpoint

**Prompt:** "What OpenTelemetry environment variables does the Node SDK read automatically, and how does `OTEL_EXPORTER_OTLP_ENDPOINT` interact with the per-signal endpoint overrides?"

**Evaluate the response:** Should explain that `OTEL_EXPORTER_OTLP_ENDPOINT` sets a base URL and the SDK appends `/v1/traces`, `/v1/metrics`, `/v1/logs` per signal. Per-signal variables (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, etc.) take precedence over the base URL when set.

### 📚 Resources

- [OTel SDK Environment Variables](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/)
- [OTLP Exporter Configuration](https://opentelemetry.io/docs/languages/js/exporters/)
