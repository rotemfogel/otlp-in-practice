# Lab: Frontend Logs - Auto-Instrumentation

### 🎯 Lab Goal

Enable automatic trace context correlation in frontend logs using Winston and OpenTelemetry.

### 📝 What You'll Learn

Winston + OpenTelemetry automatically injects `trace_id` and `span_id` into all logs within traced requests, enabling seamless log-to-trace correlation in Grafana.

### 📋 Tasks

**1. Install Winston and Instrumentation**

```bash
cd code/frontend
npm install --save-exact \
  winston@3.19.0 \
  @opentelemetry/instrumentation-winston@0.56.0 \
  @opentelemetry/winston-transport@0.10.0 \
  @opentelemetry/exporter-logs-otlp-http@0.212.0 \
  @opentelemetry/sdk-logs@0.212.0
```

**Package Purposes:**

- `winston`: Popular structured logging library for Node.js
- `@opentelemetry/instrumentation-winston`: Auto-instrumentation that injects trace context (`trace_id`, `span_id`) into Winston logs
- `@opentelemetry/winston-transport`: Required peer dependency — forwards log records through the OpenTelemetry SDK pipeline to the collector
- `@opentelemetry/exporter-logs-otlp-http`: Exports log records to the OpenTelemetry Collector via OTLP HTTP
- `@opentelemetry/sdk-logs`: Provides `BatchLogRecordProcessor` for buffering and flushing log records

**2. Create `src/logger.ts`**

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});
```

**3. Update `src/instrumentation.ts`**

Add `WinstonInstrumentation` to the instrumentations array:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

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
  logRecordProcessors: [
    new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: 'http://otel-collector:4318/v1/logs',
      }),
    ),
  ],
  instrumentations: [
    getNodeAutoInstrumentations(),
    new WinstonInstrumentation(),
  ],
});

sdk.start();
```

**4. Replace `console.log` calls with `logger`**

Add the logger import at the top of `src/routes/translation.ts`:

```typescript
import { logger } from '../logger';
```

Then replace the `console.log` / `console.error` calls:

**In `src/routes/translation.ts` — session created:**

```typescript
// Before:
console.log(
  `Created translation session ${sessionId} with ${jobsList.length} jobs`,
);

// After:
logger.info('Translation session created', {
  sessionId,
  jobCount: jobsList.length,
  targetLanguages: body.targetLanguages,
});
```

**In `src/routes/translation.ts` — session error:**

```typescript
// Before:
console.error('Error creating translation session:', error);

// After:
logger.error('Error creating translation session', {
  error: error instanceof Error ? error.message : 'Unknown error',
  stack: error instanceof Error ? error.stack : undefined,
});
```

**In `src/index.ts` — add the logger import and replace startup logs:**

```typescript
import { logger } from './logger.js';

// Before:
console.log('Initializing services...');

// After:
logger.info('Initializing services');

// Before:
console.log(`Frontend server listening on port ${PORT}`);

// After:
logger.info('Frontend server started', { port: PORT });
```

**5. Deploy**

```bash
cd compose/
docker compose -f compose.dev.yaml up --build frontend
```

**6. Generate Traffic**

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es"]}'
```

**7. Verify in Grafana Loki**

Open Grafana → Explore → Loki

Query:

```logql
{service_name="translation-frontend"} | json
```

Find logs with `trace_id` and `span_id` fields. You can then search for them in Tempo to retrieve the relevant spans and traces.

### 🤖 AI Checkpoint

**Prompt:** "How does WinstonInstrumentation automatically add trace context to logs without manual code changes?"

**Evaluate the response:** Should explain it intercepts Winston logging calls, checks for active span context, and injects trace_id/span_id from the current span automatically.

### 📚 Resources

- [Winston Instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/#winston)
- [Logs Bridge API](https://opentelemetry.io/docs/languages/js/instrumentation/#logs)
