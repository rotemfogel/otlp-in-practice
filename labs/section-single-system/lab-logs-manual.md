# Lab: Frontend Logs - Manual Instrumentation

### 🎯 Lab Goal

Add structured business logs with custom context for translation operations.

### 📝 What You'll Learn

Manual logging adds business context that complements auto-instrumented trace context: session IDs, job details, validation errors, and operational events.

### 📋 Tasks

**1. Update `src/routes/translation.ts`**

Add structured business logs throughout the request flow:

```typescript
import { logger } from '../logger';

router.post('/', async (req, res) => {
  const { text, targetLanguages } = req.body;

  // Log validation
  const validationError = validateTranslationRequest(text, targetLanguages);
  if (validationError) {
    logger.warn('Validation failed', {
      reason: validationError.errorType,
      ip: req.ip,
    });
    return res.status(validationError.statusCode).json(validationError.body);
  }

  // Log session creation
  const sessionId = uuidv4();
  logger.info('Translation session created', {
    session_id: sessionId,
    text_length: text.length,
    target_languages: targetLanguages,
    language_count: targetLanguages.length,
  });

  // Log job enqueueing
  for (const lang of targetLanguages) {
    const jobId = uuidv4();
    const job = {
      jobId,
      sessionId,
      text,
      sourceLanguage: 'en',
      targetLanguage: lang,
    };

    await queueService.enqueueJob(job);

    logger.info('Translation job enqueued', {
      job_id: jobId,
      session_id: sessionId,
      target_language: lang,
      queue: 'translation_queue',
    });
  }

  // Log session ready
  logger.info('Translation session ready', {
    session_id: sessionId,
    jobs_count: targetLanguages.length,
    status: 'pending',
  });

  res.json({
    sessionId,
    status: 'pending',
    languages: targetLanguages,
  });
});
```

Also add an SSE connection log in the `GET /:sessionId/events` route in `src/routes/translation.ts`, after calling `sseManager.addConnection`:

```typescript
sseManager.addConnection(sessionId, res);

logger.info('SSE connection established', {
  session_id: sessionId,
  ip: req.ip,
});
```

**2. Add Result Logging**

In `src/index.ts`, inside the `subscribeToResults` callback:

```typescript
await queueService.subscribeToResults(async (result: TranslationResult) => {
  logger.info('Translation result received', {
    job_id: result.jobId,
    session_id: result.sessionId,
    target_language: result.targetLanguage,
    status: result.status,
  });

  if (result.status === 'error') {
    logger.error('Translation job failed', {
      job_id: result.jobId,
      session_id: result.sessionId,
      target_language: result.targetLanguage,
      error: result.error,
    });
  }

  // Send SSE event to connected clients
  const eventType =
    result.status === 'completed'
      ? 'translation_complete'
      : 'translation_error';

  sseManager!.sendEvent(result.sessionId, eventType, result);

  // Check if all jobs for the session are done
  const session = await queueService!.getSession(result.sessionId);
  if (session && session.status === 'completed') {
    sseManager!.sendEvent(result.sessionId, 'session_complete', {
      sessionId: result.sessionId,
      status: 'completed',
    });
  }
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
# Successful request
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es", "fr"]}'

# Validation errors
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "", "targetLanguages": ["es"]}'

curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello", "targetLanguages": "invalid"}'
```

**5. Verify in Grafana Loki**

Query for session lifecycle:

```logql
{service_name="translation-frontend"} | json | session_id != ""
```

Query for validation errors:

```logql
{service_name="translation-frontend"} | json | level="warn"
```

Query for specific session:

```logql
{service_name="translation-frontend"} | json | session_id="<paste-session-id-here>"
```

**6. Practice Log-to-Trace Correlation**

1. Find a "Translation session created" log
2. Note the `session_id`
3. Click the `trace_id` link → opens the trace
4. In trace, find the `create_translation_session` span
5. Verify the span has the same `translation.session_id` attribute

### 🤖 AI Checkpoint

**Prompt:** "What fields should you add manually to business logs vs what's automatically added by OpenTelemetry?"

**Evaluate the response:** Should explain manual fields are business identifiers (session_id, job_id, language, status) and domain context. Automatic fields are trace_id, span_id, timestamp, service_name, log level.

### 📚 Resources

- [Structured Logging Best Practices](https://opentelemetry.io/docs/specs/otel/logs/)
- [Semantic Conventions for Logs](https://opentelemetry.io/docs/specs/semconv/general/logs/)
