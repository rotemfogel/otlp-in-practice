# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

This is the baseline application for the *OpenTelemetry in Practice* course (Packt). It's an async translation service with two services + Redis, used as the starting point for incremental OTel instrumentation labs. The `CHANGELOG.md` tracks lab versions (v1.1.0 baseline → v1.5.0 logs). When making changes, keep the app instrumentation-friendly: prefer explicit, traceable code paths over clever abstractions.

The repository under `code/` is one piece of a larger course repo (parent has `compose/` for observability stack — Prometheus, Loki, Tempo, OTel Collector — and `k8s/` for the Kubernetes lab). The frontend and worker emit OTLP to `OTEL_EXPORTER_OTLP_ENDPOINT` (typically the collector in `../compose/`).

## Architecture

Three components communicate via Redis:

- **frontend/** — Express 5 + TypeScript. REST API (`POST /api/translate`, `GET /api/translate/:sessionId`, SSE at `/:sessionId/events`). Owns session state in Redis hashes (`translation:session:<id>`, 1h TTL), enqueues jobs via `LPUSH`, subscribes to results via Pub/Sub.
- **worker/** — Python 3.11+. Pulls jobs via `BRPOP translation:queue`, translates with Argos Translate (offline; ~300MB models cached in `worker-models` volume), publishes results to `translation:results` channel. Adds a random 0.5–2s sleep to simulate realistic latency.
- **Redis** — single instance; three roles: queue (list), pub/sub (channel), session store (hash).

**Cross-service trace propagation is load-bearing for the labs.** The frontend injects W3C traceparent into the job JSON under `_traceContext` (`queue.ts:enqueueJob`); the worker extracts it via `propagate.extract()` and starts a CONSUMER span as a child of the producer span (`main.py` ~line 105). The reverse path (worker → frontend) re-injects context into the result payload (`main.py:inject_trace_context`) so the SSE-side `process_translation_result` span links back. Don't break this — labs rely on seeing connected traces across the Redis boundary.

Observability setup lives in `frontend/src/instrumentation.ts` and `worker/src/instrumentation.py`. Both honor standard OTel env vars (`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_METRIC_EXPORT_INTERVAL`). The frontend uses `@opentelemetry/auto-instrumentations-node` + Winston bridge; the worker uses `RedisInstrumentor` + `SystemMetricsInstrumentor` and pipes the Python root logger through an OTLP `LoggingHandler`. Custom business metrics are defined in `metrics.ts` / `metrics.py`.

## Common Commands

**Run the stack** (from `code/`):

```bash
docker compose up --build                     # production
docker compose -f compose.dev.yml up --build  # dev with hot-reload
```

Frontend at <http://localhost:3001>. Dev mode mounts `./frontend/src` and `./worker/src` as read-only volumes; the worker uses `watchmedo auto-restart` and the frontend uses `tsx watch`. `node_modules` and the Argos models live in named volumes — do **not** mount `node_modules` from host.

**Tests**:

```bash
cd frontend && npm test                              # all
cd frontend && npm test -- path/to/file.test.ts      # single file
cd frontend && npm run test:coverage

cd worker && pytest                                  # all
cd worker && pytest tests/test_translator.py         # single file
cd worker && pytest tests/test_main.py::test_name    # single test
```

Jest runs with `--maxWorkers=1` (the config relies on serial execution — don't parallelize).

**Build / lint**:

```bash
cd frontend && npm run build    # tsc → dist/
cd worker && black src tests    # formatter (dev dep)
```

There is no separate linter wired up; type errors surface via `tsc` and `pytest --strict-markers`.

## Conventions

- **Standard OTel env vars only.** All exporter configuration flows through `OTEL_*` env vars — don't hardcode endpoints or add custom config flags. See the comment block in `frontend/src/instrumentation.ts:17-23`.
- **Span naming is snake_case** (`process_translation_job`, `create_translation_session`, `enqueue_translation_jobs`). Attributes use dotted namespaces (`translation.job_id`, `translation.target_language`).
- **Logs are structured.** Frontend uses Winston with object metadata (`logger.info('...', { session_id, ... })`); worker uses Python `logging` with `extra={...}`. Keys are snake_case. The OTel log bridges auto-inject trace IDs when emitted inside an active span — preserve this by keeping logging calls inside spans where relevant.
- **Two Redis clients per service.** ioredis/redis-py block on subscribe/BRPOP, so command and pub/sub clients are kept separate. Don't collapse them.
- **Validation happens in its own span** (`validate_request` inside `create_translation_session`) — the lab demonstrates nested-span patterns, so keep that structure.
- **Three target languages max** (`es`, `fr`, `de`); enforced in `routes/translation.ts` and `worker/src/config.py`. The model download in `worker/download_models.py` must match this list.

### Code Intelligence

Prefer LSP over Grep/Glob/Read for code navigation:
- `goToDefinition` / `goToImplementation` to jump to source
- `findReferences` to see all usages across the codebase
- `workspaceSymbol` to find where something is defined
- `documentSymbol` to list all symbols in a file
- `hover` for type info without reading the file
- `incomingCalls` / `outgoingCalls` for call hierarchy

Before renaming or changing a function signature, use
`findReferences` to find all call sites first.

Use Grep/Glob only for text/pattern searches (comments,
strings, config values) where LSP doesn't help.

After writing or editing code, check LSP diagnostics before
moving on. Fix any type errors or missing imports immediately.