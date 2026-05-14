# Lab: Frontend Metrics - Manual Instrumentation

### 🎯 Lab Goal

Add custom business metrics for translation operations that auto-instrumentation doesn't capture.

### 📝 What You'll Learn

Manual metrics track business-specific operations: translation session creation, job enqueueing per language, and request validation failures.

### 📋 Tasks

**1. Create `src/metrics.ts`**

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('translation-frontend', '1.0.0');

export const translationRequestsCounter = meter.createCounter(
  'translation.requests.total',
  { description: 'Total translation requests' },
);

export const jobsEnqueuedCounter = meter.createCounter(
  'translation.jobs.enqueued.total',
  { description: 'Total translation jobs enqueued' },
);

export const requestDuration = meter.createHistogram(
  'translation.request.duration',
  { description: 'Translation request processing time', unit: 'ms' },
);

export const validationErrorsCounter = meter.createCounter(
  'translation.validation.errors.total',
  { description: 'Translation validation errors' },
);
```

**2. Instrument `src/routes/translation.ts`**

```typescript
import {
  translationRequestsCounter,
  jobsEnqueuedCounter,
  requestDuration,
  validationErrorsCounter,
} from '../metrics';

router.post('/', async (req, res) => {
  const start = Date.now();

  // Validation with error tracking
  if (!body.text || !body.text.trim()) {
    validationErrorsCounter.add(1, { error_type: 'empty_text' });
    return res.status(400).json({ error: 'Text required' });
  }

  if (!body.targetLanguages || !Array.isArray(body.targetLanguages)) {
    validationErrorsCounter.add(1, { error_type: 'invalid_languages' });
    return res.status(400).json({ error: 'Target languages required' });
  }

  // Track successful request
  translationRequestsCounter.add(1, {
    status: 'success',
    language_count: targetLanguages.length.toString(),
  });

  // Track each job enqueued
  for (const lang of targetLanguages) {
    await queueService.enqueueJob(job);
    jobsEnqueuedCounter.add(1, { target_language: lang });
  }

  // Track request duration
  requestDuration.record(Date.now() - start, {
    target_language_count: targetLanguages.length.toString(),
  });

  res.json(response);
});
```

**3. Deploy**

```bash
cd compose/
docker compose -f compose.dev.yaml up --build frontend
```

Note: For development with hot-reload, use `docker compose -f compose.dev.yaml up --build` instead.

**4. Generate Various Request Types**

```bash
# Successful requests with different language combinations
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello", "targetLanguages": ["es"]}'

curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Good morning", "targetLanguages": ["es", "fr", "de"]}'

# Validation errors
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "", "targetLanguages": ["es"]}'
```

**5. Verify in Prometheus**

Query:

- `translation_requests_total` - Request counts by language combination
- `rate(translation_requests_total[5m])` - Request rate
- `translation_jobs_enqueued_total{target_language="es"}` - Jobs per language
- `histogram_quantile(0.95, rate(translation_request_duration_bucket[5m]))` - 95th percentile latency
- `translation_validation_errors_total` - Validation failures by error type

### 🤖 AI Checkpoint

**Prompt:** "What's the difference between auto-instrumented HTTP metrics (like http_server_request_duration_seconds) and manual business metrics (like translation_request_duration)?"

**Evaluate the response:** Should explain that auto metrics track HTTP layer (includes all middleware, routing), while manual metrics track specific business logic (validation, session creation, job enqueueing).

### 📚 Resources

- [Metrics API](https://opentelemetry.io/docs/languages/js/instrumentation/#metrics)
- [Semantic Conventions for Metrics](https://opentelemetry.io/docs/specs/semconv/general/metrics/)
