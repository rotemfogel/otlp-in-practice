# Lab: Frontend Traces - Auto-Instrumentation

### 🎯 Lab Goal

Enable automatic trace generation for HTTP requests and Redis operations in the frontend.

### 📝 What You'll Learn

Auto-instrumentation creates spans for Express HTTP requests and Redis client operations, showing the complete request flow with parent-child span relationships.

### 📋 Tasks

**1. Update `src/instrumentation.ts`**

Install the `@opentelemetry/exporter-trace-otlp-http` package:

```bash
cd code/frontend
npm install --save-exact \
  @opentelemetry/exporter-trace-otlp-http@0.212.0
```

Add trace exporter to the existing SDK configuration:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

export function initInstrumentation() {
  const sdk = new NodeSDK({
    serviceName: 'translation-frontend',
    traceExporter: new OTLPTraceExporter({
      url: 'http://otel-collector:4318/v1/traces',
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: 'http://otel-collector:4318/v1/metrics',
      }),
      exportIntervalMillis: 10000,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}
```

**2. Deploy**

```bash
cd compose/
docker compose -f compose.dev.yaml up --build frontend
```

Note: For development with hot-reload, use `docker compose -f compose.dev.yaml up --build` instead.

**3. Generate Traffic**

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es", "fr"]}'
```

**4. Verify in Grafana Tempo**

Open Grafana (http://localhost:3000) → Explore → Tempo

Search for `translation-frontend` service traces.

Expected span hierarchy:

```
POST /api/translate (HTTP span)
  ├─ Redis LPUSH (job enqueue for "es")
  ├─ Redis LPUSH (job enqueue for "fr")
  └─ Redis HSET (session data)
```

**5. Examine Span Attributes**

Click on the HTTP span, verify semantic conventions:

- `http.request.method: POST`
- `http.route: /api/translate`
- `http.response.status_code: 200`
- `server.address`, `server.port`

Click on Redis spans, verify:

- `db.system: redis`
- `db.operation: LPUSH` or `HSET`
- `db.statement` (the actual Redis command)

### 🤖 AI Checkpoint

**Prompt:** "What operations are automatically traced by Express and Redis auto-instrumentation? How do they form parent-child relationships?"

**Evaluate the response:** Should explain that Express creates root spans for HTTP requests, Redis client creates child spans for each operation, and instrumentation uses context propagation to link them automatically.

### 📚 Resources

- [Express Instrumentation](https://opentelemetry.io/docs/languages/js/libraries/#express)
