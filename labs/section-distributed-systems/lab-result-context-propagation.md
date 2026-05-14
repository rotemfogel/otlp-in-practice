# Lab: Context Propagation — Worker to Frontend

### 🎯 Lab Goal

Complete the distributed trace round-trip. In the previous lab the frontend injected its trace context into the Redis job so the worker could continue the trace. Now we do the reverse: the worker injects its span context into the result payload so the frontend can create a child span when it processes that result.

After this lab a single translation request will produce a trace like this in Tempo:

```
Frontend: create_translation_session
  └─ Frontend: validate_request
  └─ Frontend: enqueue_translation_jobs
       └─ Worker: process_translation_job        (SpanKind.CONSUMER, parent = frontend)
            └─ Frontend: process_translation_result  (SpanKind.CONSUMER, parent = worker)
```

### 📝 What You'll Learn

- How to propagate trace context in **both directions** across an async queue boundary
- How to restore a remote context and attach a new span to it on the consuming side
- How to use the 4-argument overload of `tracer.startActiveSpan` (`name, options, context, fn`) in TypeScript

### 📋 Tasks

**1. Inject trace context into the result payload in `src/main.py`**

Open `code/worker/src/main.py`. The `propagate` module is already imported. Before each call to `queue_consumer.publish_result(result)`, inject the active span context into the result dict.

There are **two** publish calls: one in the unsupported-language early-exit path, and one at the bottom of the `with` block for success and exception paths.

```python
# Before each queue_consumer.publish_result(result) call, add:
trace_context: dict = {}
propagate.inject(trace_context)
result["_traceContext"] = trace_context

queue_consumer.publish_result(result)
```

> **Why inject inside the span?** `propagate.inject` captures the **currently active span**. Calling it while the `process_translation_job` span is active means the `traceparent` it writes points to that span, so the frontend can parent its `process_translation_result` span correctly.

---

**2. Add `_traceContext` to the `TranslationResult` type**

Open `code/frontend/src/types.ts` and add the optional field:

```typescript
// Before:
export interface TranslationResult {
  jobId: string;
  sessionId: string;
  targetLanguage: string;
  translatedText?: string;
  status: 'completed' | 'error';
  durationMs: number;
  completedAt: string;
  error?: string;
}

// After:
export interface TranslationResult {
  jobId: string;
  sessionId: string;
  targetLanguage: string;
  translatedText?: string;
  status: 'completed' | 'error';
  durationMs: number;
  completedAt: string;
  error?: string;
  _traceContext?: Record<string, string>;
}
```

---

**3. Add imports to `src/index.ts`**

Open `code/frontend/src/index.ts` and add the required OTel and tracer imports:

```typescript
import {
  propagation,
  context,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import { tracer, setSpanError } from './tracers.js';
```

---

**4. Extract the worker's context and wrap result processing in a span**

Still in `src/index.ts`, update the `subscribeToResults` callback. Extract the remote context from the result payload, then wrap the processing block in a `process_translation_result` span:

```typescript
// Before:
await queueService.subscribeToResults(async (result: TranslationResult) => {
  logger.info('Translation result received', { ... });
  if (result.status === 'error') { ... }
  try {
    await queueService!.updateJobStatus(...);
    sseManager!.sendEvent(...);
    const session = await queueService!.getSession(result.sessionId);
    if (session && session.status === 'completed') { ... }
  } catch (error) { ... }
});

// After:
await queueService.subscribeToResults(async (result: TranslationResult) => {
  // Restore the trace context propagated back from the worker.
  const remoteCtx = propagation.extract(
    context.active(),
    result._traceContext ?? {},
  );

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

  await tracer.startActiveSpan(
    'process_translation_result',
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        'translation.job_id': result.jobId,
        'translation.session_id': result.sessionId,
        'translation.target_language': result.targetLanguage,
        'translation.status': result.status,
      },
    },
    remoteCtx,
    async (resultSpan) => {
      try {
        await queueService!.updateJobStatus(
          result.sessionId,
          result.targetLanguage,
          result.status === 'completed' ? 'completed' : 'error',
          result.translatedText,
          result.error,
        );

        const eventType =
          result.status === 'completed'
            ? 'translation_complete'
            : 'translation_error';

        sseManager!.sendEvent(result.sessionId, eventType, result);

        const session = await queueService!.getSession(result.sessionId);
        if (session && session.status === 'completed') {
          sseManager!.sendEvent(result.sessionId, 'session_complete', {
            sessionId: result.sessionId,
            status: 'completed',
          });
          logger.info('Translation session completed', {
            session_id: result.sessionId,
            status: 'completed',
          });
        }

        resultSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        setSpanError(resultSpan, error);
        logger.error('Error processing translation result', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        resultSpan.end();
      }
    },
  );
});
```

> **Note:** `tracer.startActiveSpan` has three overloads. The 4-argument form `(name, options, context, fn)` is needed here to pass both `SpanOptions` (for `kind` and `attributes`) **and** a custom parent context extracted from the result payload.

---

### ✅ Verification

**Generate traffic:**

```bash
for i in {1..5}; do
  curl -s -X POST http://localhost:3001/api/translate \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello world", "targetLanguages": ["es", "fr", "de"]}'
  echo ""
  sleep 2
done
```

**In Tempo (Grafana → Explore → Tempo):**

1. Search for service `translation-frontend`
2. Open any trace
3. You should see a span tree like:
   ```
   create_translation_session  [translation-frontend]
     ├─ validate_request        [translation-frontend]
     └─ enqueue_translation_jobs [translation-frontend]
          └─ process_translation_job     [translation-worker]
               └─ process_translation_result [translation-frontend]
   ```
4. The `process_translation_result` span should carry these attributes:
   - `translation.job_id`
   - `translation.session_id`
   - `translation.target_language`
   - `translation.status`

---

### 🤖 AI Checkpoints

1. **Context Extraction and the Active Span:**

   Ask your AI assistant: "In the frontend, we use `propagation.extract(context.active(), carrier)` rather than `propagation.extract({})`. Why does the base context matter here, and what would happen if we passed an empty or wrong base context?"

   **What to evaluate:** Does it explain that `context.active()` provides the currently active context to _merge_ the extracted remote context into, preserving any local context already on the stack? Does it clarify that passing an empty context would still work for extracting the traceparent, but could discard baggage or other propagators active in the current context? Does it note the subtlety that the returned context is not automatically activated — the caller must pass it explicitly to `startActiveSpan`?

2. **Resilience When the Worker Crashes Mid-Flight:**

   Ask: "What happens to the distributed trace if the worker crashes after consuming the job but before calling `propagate.inject` on the result? How would you detect and handle this gap in production?"

   **What to evaluate:** Does it explain that the frontend's `process_translation_result` span would either never be created or appear as an orphan root span with no parent? Does it mention that the worker span would be left open (never ended), causing it to eventually be dropped or timeout depending on SDK settings? Does it suggest using timeouts, health checks, or a dead-letter queue to detect stuck jobs and emit a synthetic error span for observability?

3. **Generalising to Other Message Brokers:**

   Ask: "We embedded the `traceparent` in a JSON job payload to propagate context over Redis. How would this pattern change if you were using Kafka? Does Kafka offer a more idiomatic way to carry trace context?"

   **What to evaluate:** Does it explain that Kafka record headers (available since Kafka 0.11) are the idiomatic carrier for trace context, similar to HTTP headers — avoiding the need to embed context in the message body? Does it mention that the W3C `traceparent` key would be set as a Kafka header string and extracted by the consumer using the same OTel propagation API? Does it note that embedding context in the payload body (the Redis pattern) is a valid fallback for brokers that don't support headers?
