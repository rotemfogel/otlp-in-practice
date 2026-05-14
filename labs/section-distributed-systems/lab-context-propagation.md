# Lab: Context Propagation — Frontend to Worker

### 🎯 Lab Goal

Connect the frontend and worker into a single distributed trace. After this lab, a translation request will appear as one continuous trace in Tempo — from the frontend's `create_translation_session` span all the way through the worker's `process_translation_job` span.

### 📝 What You'll Learn

Redis messages don't carry HTTP headers, so there is no automatic trace context propagation across the queue boundary. The solution is to manually embed the W3C `traceparent` value into the job payload on the frontend side, and extract it on the worker side using the OTel propagation API. This pattern applies to any message queue or async communication channel.

### 📋 Tasks

**1. Add `_traceContext` to the `TranslationJob` type**

Open `code/frontend/src/types.ts` and add the optional `_traceContext` field to `TranslationJob`:

```typescript
// Before:
export interface TranslationJob {
  jobId: string;
  sessionId: string;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: string;
}

// After:
export interface TranslationJob {
  jobId: string;
  sessionId: string;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: string;
  _traceContext?: Record<string, string>;
}
```

**2. Inject trace context in `enqueueJob`**

Open `code/frontend/src/services/queue.ts` and add the propagation import and inject call inside `enqueueJob`:

```typescript
// Add import at the top of the file:
import { propagation, context } from '@opentelemetry/api';
```

Update `enqueueJob` to inject the active trace context before serialising:

```typescript
// Before:
async enqueueJob(job: TranslationJob): Promise<void> {
  if (!this.client) {
    throw new Error('QueueService not connected');
  }
  const jobJson = JSON.stringify(job);
  await this.client.lpush(this.queueKey, jobJson);
  logger.info('Job enqueued', { ... });
}

// After:
async enqueueJob(job: TranslationJob): Promise<void> {
  if (!this.client) {
    throw new Error('QueueService not connected');
  }

  // Inject current trace context into the job payload so the worker
  // can restore it and create a child span linked to this trace.
  const _traceContext: Record<string, string> = {};
  propagation.inject(context.active(), _traceContext);

  const jobJson = JSON.stringify({ ...job, _traceContext });
  await this.client.lpush(this.queueKey, jobJson);
  logger.info('Job enqueued', {
    job_id: job.jobId,
    session_id: job.sessionId,
    target_language: job.targetLanguage,
    queue: this.queueKey,
  });
}
```

**3. Extract trace context and create a root span in `src/main.py`**

Open `code/worker/src/main.py` and add the OTel trace imports:

```python
# Add these imports at the top:
from opentelemetry import trace, propagate
from opentelemetry.trace import SpanKind, StatusCode
```

Then add a module-level tracer and wrap the job processing loop body with a span.

Add the tracer after the imports:

```python
logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)  # Add this line
```

In the main processing loop, replace the job processing block with one that extracts the remote context and wraps the work in a span. Locate the section that starts with `# Validate target language` and update the structure:

```python
# Before:
job = queue_consumer.wait_for_job(timeout=1)

if job is None:
    continue

# Extract job details
job_id = job.get("jobId")
session_id = job.get("sessionId")
text = job.get("text")
source_lang = job.get("sourceLanguage", config.source_language)
target_lang = job.get("targetLanguage")

if not all([job_id, session_id, text, target_lang]):
    logger.error(f"Invalid job data: {job}")
    continue

# Validate target language... then translate... then publish...

# After:
job = queue_consumer.wait_for_job(timeout=1)

if job is None:
    continue

# Extract job details
job_id = job.get("jobId")
session_id = job.get("sessionId")
text = job.get("text")
source_lang = job.get("sourceLanguage", config.source_language)
target_lang = job.get("targetLanguage")

if not all([job_id, session_id, text, target_lang]):
    logger.error(f"Invalid job data: {job}")
    continue

# Extract remote trace context from the job payload.
# propagate.extract() reads the W3C traceparent value injected by the frontend.
# If "_traceContext" is absent or malformed, extract() returns a background context
# — no exception is thrown. The worker will simply start a new root span instead of
# a child span, so traces won't be connected but processing continues normally.
remote_ctx = propagate.extract(job.get("_traceContext", {}))

with tracer.start_as_current_span(
    "process_translation_job",
    context=remote_ctx,
    kind=SpanKind.CONSUMER,
    attributes={
        "translation.job_id": job_id,
        "translation.session_id": session_id,
        "translation.target_language": target_lang,
        "translation.text_length": len(text) if text else 0,
    },
) as span:
    try:
        # --- move the existing validate / translate / publish code here ---

        # Validate target language
        if target_lang not in config.supported_languages:
            error_msg = f"Unsupported target language: {target_lang}"
            logger.error(error_msg)
            span.set_status(trace.Status(StatusCode.ERROR, error_msg))
            result = {
                "jobId": job_id,
                "sessionId": session_id,
                "targetLanguage": target_lang,
                "status": "error",
                "error": error_msg,
                "durationMs": 0,
                "completedAt": datetime.now(timezone.utc).isoformat() + "Z",
            }
            queue_consumer.publish_result(result)
            continue

        # Translate
        assert text is not None
        logger.info(f"Processing job {job_id}: {source_lang} -> {target_lang}")
        start_time = time.time()

        delay = random.uniform(0.5, 2.0)
        time.sleep(delay)

        translated_text = translator.translate(text, source_lang, target_lang)
        duration_ms = int((time.time() - start_time) * 1000)

        span.set_attribute("translation.duration_ms", duration_ms)

        result = {
            "jobId": job_id,
            "sessionId": session_id,
            "targetLanguage": target_lang,
            "translatedText": translated_text,
            "status": "completed",
            "durationMs": duration_ms,
            "completedAt": datetime.now(timezone.utc).isoformat() + "Z",
        }

        logger.info(f"Job {job_id} completed successfully in {duration_ms}ms")

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)
        logger.error(f"Translation failed for job {job_id}: {error_msg}")
        span.record_exception(e)
        span.set_status(trace.status.Status(StatusCode.ERROR, error_msg))
        result = {
            "jobId": job_id,
            "sessionId": session_id,
            "targetLanguage": target_lang,
            "status": "error",
            "error": error_msg,
            "durationMs": duration_ms,
            "completedAt": datetime.now(timezone.utc).isoformat() + "Z",
        }

    queue_consumer.publish_result(result)
```

**4. Deploy both services**

The frontend has changed (TypeScript source change, hot-reloads automatically). The worker source also changed (Python file, watchmedo picks it up automatically). No rebuild needed:

```bash
cd compose/
docker compose -f compose.dev.yaml up -d
```

Wait a few seconds for both services to restart.

**5. Generate traffic**

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es", "fr"]}'
```

**6. Verify end-to-end trace in Grafana Tempo**

Open Grafana at http://localhost:3000 → Explore → Tempo → Search

Filter by `service.name = translation-frontend`. Open a recent trace.

Expected span hierarchy:

```
[translation-frontend] POST /api/translate
  └─ [translation-frontend] create_translation_session
       └─ [translation-frontend] validate_request
       └─ [translation-frontend] enqueue_translation_jobs
            ├─ [translation-worker] process_translation_job  ← remote span, linked trace
            └─ [translation-worker] process_translation_job  ← one per target language
```

The worker spans should appear as children of `enqueue_translation_jobs` with `span.kind = CONSUMER`. The `is_remote` flag indicates the span boundary crossed a service.

### 🤖 AI Checkpoints

1. **W3C TraceContext and the Propagation API:**

   Ask your AI assistant: "What is the W3C `traceparent` header format, and why does it work as a carrier across Redis message payloads even though Redis has no native header support?"

   **What to evaluate:** Does it explain the `traceparent` format (`00-{trace_id}-{parent_span_id}-{flags}`)? Does it clarify that OTel's `propagation.inject/extract` writes and reads into any plain dict/map — not just HTTP headers? Does it mention that embedding the context in a JSON job payload is the standard technique for async queue propagation, and that `SpanKind.CONSUMER` signals the span continues a remote trace?

2. **Handling Missing or Corrupt Trace Context:**

   Ask: "In production, trace context propagation can fail silently — the worker might receive a job with no `_traceContext` field, or with a malformed `traceparent`. How should the worker handle this gracefully, and what tracing behavior would you expect?"

   **What to evaluate:** Does it explain that `propagation.extract` on an empty or invalid carrier simply returns a no-op context, so no exception is thrown? Does it mention that the result is an orphan root span on the worker side rather than a crash? Does it recommend logging a warning when `_traceContext` is missing so propagation gaps are visible in operational logs?

3. **SpanKind and Cross-Service Semantics:**

   Ask: "This lab uses `SpanKind.CONSUMER` on the worker span that continues the frontend trace. What does `SpanKind` communicate to the tracing backend, and what are all the valid values? How would the trace look different if `SpanKind.INTERNAL` were used instead?"

   **What to evaluate:** Does it list the five kinds (`CLIENT`, `SERVER`, `PRODUCER`, `CONSUMER`, `INTERNAL`) and explain their semantic meaning? Does it explain that `CONSUMER` signals an async cross-process boundary and allows backends like Tempo to render the correct waterfall shape? Does it note that using `INTERNAL` would hide the async boundary and make the trace misleadingly appear as a local call chain?

### 📚 Resources

- [W3C TraceContext specification](https://www.w3.org/TR/trace-context/)
- [Python OTel propagation API](https://opentelemetry.io/docs/languages/python/propagation/)
- [JavaScript OTel propagation API](https://opentelemetry.io/docs/languages/js/propagation/)
