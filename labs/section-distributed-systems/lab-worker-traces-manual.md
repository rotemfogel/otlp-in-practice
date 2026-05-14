# Lab: Worker Traces - Manual Instrumentation

### 🎯 Lab Goal

Add a `translate_text` child span inside `translator.py` so the trace waterfall shows the time spent in the actual translation model separately from the rest of job processing.

### 📝 What You'll Learn

- How to create a nested child span with `start_as_current_span`
- How `span.record_exception` and `span.set_status` work together

### 📋 Tasks

**1. Update `code/worker/src/translator.py`**

Add the imports and a module-level tracer at the top:

```python
from opentelemetry import trace
from opentelemetry.trace import StatusCode

tracer = trace.get_tracer(__name__)
```

Wrap the `translate()` method body in a span:

```python
def translate(self, text: str, source: str, target: str) -> str:
    if not text or not text.strip():
        return text

    with tracer.start_as_current_span(
        "translate_text",
        attributes={
            "translation.source_language": source,
            "translation.target_language": target,
            "translation.text_length": len(text),
        },
    ) as span:
        try:
            translation = argostranslate.translate.get_translation_from_codes(source, target)

            if translation is None:
                error_msg = f"Translation model not available for {source} -> {target}"
                span.set_status(trace.Status(StatusCode.ERROR, error_msg))
                raise ValueError(error_msg)

            translated_text = translation.translate(text)
            span.set_attribute("translation.output_length", len(translated_text))
            span.set_status(trace.Status(StatusCode.OK))
            return translated_text

        except ValueError:
            raise
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.Status(StatusCode.ERROR, str(e)))
            raise RuntimeError(f"Translation failed ({source} -> {target}): {e}") from e
```

**2. Deploy and verify**

Changes are hot-reloaded. Generate traffic and open a trace in Tempo. Expected span hierarchy:

```
[translation-worker] process_translation_job
  └─ [translation-worker] translate_text
       └─ [translation-worker] PUBLISH  (Redis auto-span)
```

Click `translate_text` and confirm attributes `translation.source_language`, `translation.target_language`, `translation.text_length`, `translation.output_length` are all present.

### 🤖 AI Checkpoints

1. **set_status vs. record_exception:**

   Ask your AI assistant: "What is the difference between `span.set_status(StatusCode.ERROR)` and `span.record_exception(e)` in OpenTelemetry? When should you use both together, and what happens if you use only one?"

   **What to evaluate:** Does it explain that `set_status(ERROR)` marks the span as failed at the protocol level — this is what backends like Tempo use to colour error spans red and include them in error-rate calculations? Does it clarify that `record_exception(e)` adds the exception as a structured event (with `exception.type`, `exception.message`, `exception.stacktrace` attributes) but does *not* by itself mark the span as errored? Does it recommend always using both together so the span is both machine-queryable as an error *and* contains the human-readable exception detail?

2. **Span Attributes vs. Span Events:**

   Ask: "In the `translate_text` span, we record `translation.text_length` and `translation.output_length` as span attributes. How do span attributes differ from span events, and when would you choose one over the other for observability data?"

   **What to evaluate:** Does it explain that span attributes are key-value pairs describing the *overall nature* of the operation (indexed and queryable in most backends), while span events are timestamped annotations recording *something that happened at a point in time* during the span? Does it give a practical example: use an attribute for `translation.output_length` (a scalar property of the result) but use an event for `"cache miss"` or `"model loaded"` (discrete occurrences mid-execution)? Does it note that most SaaS tracing backends charge or limit by attribute count and event count separately?

3. **Preventing Span Leaks with Context Managers:**

   Ask: "The `translate_text` span uses `start_as_current_span` as a context manager. What would happen if a developer created a span manually with `tracer.start_span()` and forgot to call `span.end()`? How does the SDK protect against this, if at all?"

   **What to evaluate:** Does it explain that orphaned spans (never ended) are held in memory until the `SpanProcessor` flushes or the process exits, potentially causing memory leaks or data loss? Does it note that the SDK does *not* automatically end open spans — this is the developer's responsibility? Does it recommend always using `start_as_current_span` as a context manager (or the equivalent `with tracer.start_as_current_span(...)` block) to guarantee `span.end()` is called even when exceptions are raised?
