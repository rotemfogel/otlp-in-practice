# Lab: Refactoring - Structured Logging in the Worker

### 🎯 Lab Goal

Refactor the worker's logging from plain-text interpolated strings to structured JSON logging — matching the approach already used in the frontend. Use your AI assistant to perform the refactoring.

### 📝 Overview & Concepts

Open `code/frontend/src/logger.ts` and compare it to `code/worker/src/main.py`.

The frontend uses Winston with `winston.format.json()` — every log line is a JSON object:

```json
{
  "timestamp": "2024-01-15T10:23:45.123Z",
  "level": "info",
  "message": "Processing translation request",
  "session_id": "abc-123",
  "target_languages": ["es", "fr"]
}
```

The worker uses Python's stdlib `logging` module with a plain-text format string and f-string interpolation:

```python
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger.info(f"Processing job {job_id}: {source_lang} -> {target_lang}")
```

This produces a string like:

```
2024-01-15 10:23:45,123 - worker.main - INFO - Processing job abc-123: en -> es
```

The difference matters for observability. With plain text, `job_id` is buried in the message string — you cannot filter by it in Loki without regex. With structured logging, `job_id` is a queryable field:

```logql
{service_name="translation-worker"} | json | job_id = "abc-123"
```

### 📋 Tasks

**1. Study the current logging in the worker**

Read through `code/worker/src/main.py` and `code/worker/src/queue.py`. Note:

- How `logging.basicConfig()` is configured
- Every `logger.info()`, `logger.error()`, and `logger.debug()` call that uses f-string interpolation
- What contextual data (job IDs, language codes, durations, host/port) is currently interpolated into message strings

**2. Ask your AI assistant to perform the refactoring**

Open your AI assistant and provide this prompt:

---

_I want to refactor the logs from the worker to also follow structured logging, similar to the frontend. Research the codebase under `code` and provide a plan for the implementation. Pause and ask for my feedback on the plan before proceeding with the implementation._

---

**Review the AI's plan before approving it.** Check:

- Does it plan to add a JSON formatter library to the `pyproject.toml` file?
- Does it plan to replace `basicConfig` with a structured JSON handler?
- Does it identify the f-string log calls in both `main.py` and `queue.py`?
- Does the plan separate event descriptions from contextual data (no variable interpolation in message strings)?

Once you're happy with the plan, tell the AI to proceed with the implementation.

**3. Apply the changes and verify**

Once satisfied with the AI's output, apply the changes.

Reinstall dependencies in the worker. Depending on your setup:

**With `uv` (recommended):**

```bash
cd code/worker
uv sync
```

**With `pip` and a virtual environment:**

```bash
cd code/worker
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Restart the worker (if running via Docker Compose):

```bash
cd compose
docker compose -f compose.dev.yaml up --build worker
docker compose -f compose.dev.yaml logs worker --tail=20
```

You should now see JSON lines in the worker logs:

```json
{
  "timestamp": "2024-01-15 10:23:45,123",
  "level": "INFO",
  "name": "worker.main",
  "message": "Worker ready, waiting for jobs..."
}
```

**4. Send a translation request and check Loki**

Generate a request:

```bash
curl -X POST http://localhost:3000/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Structured logging", "targetLanguages": ["es"]}'
```

In Grafana → Explore → Loki, run:

```logql
{service_name="translation-worker"} | json
```

Expand a log entry. You should now see `job_id`, `target_language`, and `duration_ms` as separate fields rather than embedded in a message string.

Try a field filter that would have been impossible before:

```logql
{service_name="translation-worker"} | json | target_language = "es"
```

### 🤖 AI Checkpoints

1. **Self-Auditing the Refactoring:**

   After applying the AI's changes, ask your AI assistant: "Look at the refactored `main.py` and `queue.py`. Are there any log calls where variable data is still being interpolated directly into the message string rather than passed as structured fields? If so, point them out."

   **What to evaluate:** A strong answer proactively finds any leftover f-string interpolations and explains _why_ they are a problem — specifically that the variable data becomes unsearchable when embedded in the message. A shallow answer says "looks good" without evidence. If the AI misses cases you can spot yourself, push back with a specific example and ask it to re-examine.

2. **Structured Logging and Observability Querying:**

   Ask your AI assistant: "Before this refactoring, how would you have queried Loki to find all logs for a specific `job_id` in the worker? How does the structured logging change make that query simpler and more reliable?"

   **What to evaluate:** Does it explain that the old approach required a regex against the full message string (e.g., `|~ "job-abc-123"`) which is fragile and slow? Does it describe the new approach as a parsed field filter (`| json | job_id = "abc-123"`) which is exact and indexed? Does it mention that regex matching forces Loki to scan every log line, while parsed field filters can be applied after a fast stream selector, making them significantly cheaper at scale?

3. **Structured Logging vs. Log Sampling:**

   Ask: "We now emit structured log fields like `duration_ms` and `job_id` with every translation event. In a high-throughput production system, what tradeoffs would you consider between keeping all these log events versus sampling them or moving some of that data into metrics or trace attributes instead?"

   **What to evaluate:** Does it acknowledge that logs are the most expensive signal per event at high volume, especially in managed logging backends? Does it explain that repetitive high-cardinality data (like per-job durations) is often better captured as a histogram metric or a span attribute, reserving logs for exceptional events and contextual detail? Does it mention tail-based or head-based sampling as a strategy for traces, and log sampling or aggregation for reducing log volume without losing visibility?

### 📚 Resources

- [python-json-logger documentation](https://github.com/madzak/python-json-logger)
- [Loki LogQL — Parsed field filters](https://grafana.com/docs/loki/latest/query/log_queries/#parsed-label-filter-expression)
- [OpenTelemetry Logs data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)
