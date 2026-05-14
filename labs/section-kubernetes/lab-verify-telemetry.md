# Lab: Verify Telemetry in Kubernetes

## 🎯 Lab Goal

Confirm that all three telemetry signals — metrics, logs, and traces — are flowing correctly through the full Kubernetes observability pipeline: application → OTel Collector → Prometheus / Loki / Tempo.

## 📝 Overview & Concepts

After deploying to Kubernetes, the telemetry path is identical in structure to Docker Compose but the network hops now cross namespace and pod boundaries. Before trusting the data in dashboards, it is worth running a set of targeted queries to prove each signal is present and meaningful.

Both port-forwards should already be running from the previous lab. If not, start them again:

```bash
kubectl -n app port-forward svc/frontend 3001:3000
kubectl -n observability port-forward svc/grafana 3000:3000
kubectl -n observability port-forward svc/prometheus 9090:9090
```

> **Minikube users:** use `minikube service` instead. Run each command in a separate terminal:
>
> ```bash
> minikube service frontend -n app --url
> minikube service grafana -n observability --url
> minikube service prometheus -n observability --url
> ```
>
> Use the printed URLs in place of `http://localhost:3001`, `http://localhost:3000`, and `http://localhost:9090` in the steps below.

Generate some traffic — including a few invalid requests to produce warnings and errors:

```bash
# Valid requests
for i in {1..5}; do
  curl -s -X POST http://localhost:3001/api/translate \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello Kubernetes!", "targetLanguages": ["es", "fr", "de"]}'
done

# Invalid requests (unsupported language — triggers validation warning)
for i in {1..3}; do
  curl -s -X POST http://localhost:3001/api/translate \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello!", "targetLanguages": ["xx"]}'
done
```

## 📋 Tasks

### Part 1 — Verify metrics in Prometheus

Open the Prometheus UI at `http://localhost:9090`.

**1. Confirm the OTel Collector pipeline is healthy**

In **Status → Targets**, find the `otel-collector` job and verify it shows `UP`. Then check that all three signals are flowing through the Collector:

```promql
rate(otelcol_receiver_accepted_spans_total[5m])
rate(otelcol_receiver_accepted_metric_points_total[5m])
rate(otelcol_receiver_accepted_log_records_total[5m])
```

All three should be non-zero. If any reads zero, check that the Deployment manifests use `otel-collector.observability.svc.cluster.local:4318` as the OTLP endpoint.

**2. Frontend request and validation error rates**

```promql
# Per-second translation request rate
rate(translation_requests_total{exported_job="translation-frontend"}[5m])

# Validation errors by error type (should spike after the invalid requests above)
translation_validation_errors_total{exported_job="translation-frontend"}
```

**3. Worker job outcomes by language and status**

```promql
sum by (translation_target_language, translation_status) (
  translation_jobs_total{exported_job="translation-worker"}
)
```

You should see `status="completed"` entries for `es`, `fr`, and `de`.

**4. 95th percentile translation duration**

```promql
histogram_quantile(
  0.95,
  rate(translation_duration_milliseconds_bucket{exported_job="translation-worker"}[5m])
)
```

> **Note on metric names:** The OTel Collector's Prometheus exporter converts dots to underscores and appends the unit suffix. `translation.duration` with unit `ms` becomes `translation_duration_milliseconds`.

---

### Part 2 — Verify logs in Loki

Open Grafana at `http://localhost:3000`, navigate to **Explore**, and select the **Loki** data source.

**5. Confirm logs from both services**

```logql
{service_name="translation-frontend"} | json
```

```logql
{service_name="translation-worker"} | json
```

Both should return structured JSON entries. If either returns nothing, check that the OTel Collector log pipeline is receiving data (step 1 above).

**6. Filter for warnings and errors across all services**

```logql
{service_name=~"translation-.*"} | json | severity_text=~"(?i)warn|error"
```

The invalid requests from the traffic loop above should have produced warning entries in the frontend logs.

**7. Trace a specific session across both services**

Copy a `session_id` from any frontend log entry, then filter both services down to that session:

```logql
{service_name="translation-frontend"} | json | session_id="<paste-session-id-here>"
```

Click the `trace_id` field on any log line — if Tempo is wired up as a data source in Grafana, a direct link to the trace will appear.

---

### Part 3 — Verify traces in Tempo

**8. Find a recent trace**

In Grafana Explore, switch to the **Tempo** data source. Use **Search** mode with:

- **Service name**: `translation-frontend`
- **Span name**: `create_translation_session`

Click any result to open the flame graph. Verify that:

- Child spans `validate_request` and `enqueue_translation_jobs` appear under the root.
- The worker span `process_translation_job` appears as a child, confirming cross-service context propagation over Redis.

If the worker span is a separate root trace instead of a child, context propagation is broken — review the `_traceContext` injection in the frontend and `propagate.extract()` in the worker.

## 📚 Resources

- [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Loki LogQL reference](https://grafana.com/docs/loki/latest/query/)
- [OpenTelemetry Collector observability](https://opentelemetry.io/docs/collector/internal-telemetry/)
