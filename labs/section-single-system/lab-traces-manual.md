# Lab: Frontend Traces - Manual Instrumentation

### 🎯 Lab Goal

Add custom spans for business operations to provide deeper insight into the translation request flow.

### 📝 What You'll Learn

Manual spans capture business logic that auto-instrumentation misses: session creation, job enqueueing loop, validation steps. Custom spans add business context through attributes.

### 📋 Tasks

**1. Update `src/routes/translation.ts`**

Add tracer import and create manual spans:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('translation-frontend', '1.0.0');

router.post('/', async (req, res) => {
  await tracer.startActiveSpan(
    'create_translation_session',
    async (sessionSpan) => {
      try {
        const { text, targetLanguages } = req.body;

        // Add business attributes
        sessionSpan.setAttribute('translation.text_length', text.length);
        sessionSpan.setAttribute(
          'translation.target_language_count',
          targetLanguages.length,
        );
        sessionSpan.setAttribute(
          'translation.target_languages',
          targetLanguages.join(','),
        );

        const sessionId = uuidv4();
        sessionSpan.setAttribute('translation.session_id', sessionId);

        // Validation span
        await tracer.startActiveSpan(
          'validate_request',
          async (validationSpan) => {
            try {
              if (!text || !text.trim()) {
                validationSpan.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: 'Empty text',
                });
                validationSpan.end();
                return res.status(400).json({ error: 'Text required' });
              }
              validationSpan.setStatus({ code: SpanStatusCode.OK });
            } finally {
              validationSpan.end();
            }
          },
        );

        // Job enqueueing span
        await tracer.startActiveSpan(
          'enqueue_translation_jobs',
          async (enqueueSpan) => {
            try {
              enqueueSpan.setAttribute(
                'translation.jobs_count',
                targetLanguages.length,
              );

              for (const lang of targetLanguages) {
                const job = {
                  jobId: uuidv4(),
                  sessionId,
                  text,
                  sourceLanguage: 'en',
                  targetLanguage: lang,
                };

                await queueService.enqueueJob(job);
              }

              enqueueSpan.setStatus({ code: SpanStatusCode.OK });
            } catch (error) {
              enqueueSpan.recordException(error);
              enqueueSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              throw error;
            } finally {
              enqueueSpan.end();
            }
          },
        );

        sessionSpan.setStatus({ code: SpanStatusCode.OK });
        res.json({ sessionId, jobs: targetLanguages.length });
      } catch (error) {
        sessionSpan.recordException(error);
        sessionSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        res.status(500).json({ error: 'Server error' });
      } finally {
        sessionSpan.end();
      }
    },
  );
});
```

**2. Deploy**

```bash
cd compose/
docker compose -f compose.dev.yaml up --build frontend
```

Note: For development with hot-reload, use `docker compose -f compose.dev.yaml up --build` instead.

**3. Generate Traffic**

```bash
# Successful request
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es", "fr", "de"]}'

# Validation error
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "", "targetLanguages": ["es"]}'
```

**4. Verify in Grafana Tempo**

Search for traces, expect enriched hierarchy:

```
POST /api/translate (auto)
  └─ create_translation_session (manual)
       ├─ validate_request (manual)
       └─ enqueue_translation_jobs (manual)
            ├─ Redis LPUSH (auto) - es
            ├─ Redis LPUSH (auto) - fr
            └─ Redis LPUSH (auto) - de
```

**5. Examine Custom Attributes**

Click on `create_translation_session` span:

- `translation.text_length`
- `translation.target_language_count`
- `translation.target_languages`
- `translation.session_id`

Click on `enqueue_translation_jobs` span:

- `translation.jobs_count`

### 🤖 AI Checkpoint

**Prompt:** "When should you create a custom span vs relying on auto-instrumentation? What makes a good span boundary?"

**Evaluate the response:** Should explain custom spans are for business operations, conceptual boundaries, multi-step processes. Good spans represent meaningful units of work with clear start/end, not too granular (function calls) or too coarse (entire service).

### 📚 Resources

- [Tracing API](https://opentelemetry.io/docs/languages/js/instrumentation/#traces)
- [Span Best Practices](https://opentelemetry.io/docs/concepts/signals/traces/#span)
