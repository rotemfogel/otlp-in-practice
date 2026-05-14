# Section: Distributed Systems Observability

This section completes the observability picture by instrumenting the Python worker service and establishing end-to-end distributed traces that connect the frontend and worker through Redis.

## Goal

By the end of this section, a single translation request will be visible as one connected trace spanning:

```
Frontend POST /api/translate
  └─ Frontend: create_translation_session
       └─ Frontend: enqueue_translation_jobs
            └─ Worker: process_translation_job          (SpanKind.CONSUMER — restores frontend context)
                 └─ Frontend: process_translation_result (SpanKind.CONSUMER — restores worker context)
```

## Labs

1. [Lab: Worker Metrics - Auto-Instrumentation](lab-worker-metrics-auto.md)
2. [Lab: Worker Logs - Auto-Instrumentation](lab-worker-logs-auto.md)
3. [Lab: Worker Traces - Auto-Instrumentation](lab-worker-traces-auto.md)
4. [Lab: Context Propagation - Frontend to Worker](lab-context-propagation.md)
5. [Lab: Context Propagation - Worker to Frontend](lab-result-context-propagation.md)
6. [Lab: Worker Metrics - Manual Instrumentation](lab-worker-metrics-manual.md)
7. [Lab: Worker Traces - Manual Instrumentation](lab-worker-traces-manual.md)
8. [Lab: Redis Metrics via Prometheus Exporter](lab-redis-metrics.md)
9. [Lab: Refactoring - Environment-Driven Configuration](lab-refactoring-env-config.md)
10. [Lab: Refactoring - Structured Logging in the Worker](lab-refactoring-structured-logs.md)
