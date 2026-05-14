# Lab: Log-to-Trace Correlation with Grafana

### 🎯 Lab Goal

Configure bidirectional correlation between logs (Loki) and traces (Tempo) in Grafana, so you can jump from a log entry directly to its trace, and from a trace directly to its logs.

### 📝 What You'll Learn

The OTel Collector forwards logs to Loki via the OTLP protocol, which automatically stores trace context (`trace_id`, `span_id`) as Loki stream labels. Grafana can use these labels — along with datasource UIDs — to link Loki and Tempo together in both directions without any changes to application code.

### 📋 Tasks

**1. Stop the stack and wipe the Grafana volume**

Removing the Grafana volume ensures the updated provisioning config is applied from scratch on restart:

```bash
docker compose -f compose.dev.yaml down
docker volume rm compose_grafana-data
```

**2. Add UIDs to all datasources**

Open `compose/grafana-datasources.yaml`. Cross-datasource linking requires stable UIDs so datasources can reference each other. Ensure all three datasources have explicit `uid` fields:

```yaml
datasources:
  - name: Prometheus
    uid: prometheus
    # ...

  - name: Loki
    uid: loki
    # ...

  - name: Tempo
    uid: tempo
    # ...
```

**3. Configure trace-to-log correlation in Tempo**

Add `tracesToLogsV2` to the Tempo datasource `jsonData`. This enables a **Logs** button inside Tempo's trace view that queries Loki for logs matching the same trace:

```yaml
- name: Tempo
  uid: tempo
  type: tempo
  access: proxy
  url: http://tempo:3200
  editable: false
  jsonData:
    tracesToLogsV2:
      datasourceUid: loki
      filterByTraceID: true
      filterBySpanID: false
      tags:
        - key: service.name
          value: service_name
```

- `filterByTraceID: true` — adds a `trace_id` filter to the generated Loki query automatically
- `tags` — maps the OTel span attribute `service.name` to the Loki stream label `service_name`, scoping the log query to the correct service

**4. Configure log-to-trace correlation in Loki**

Add `derivedFields` to the Loki datasource `jsonData`. This creates a clickable **Trace ID** link on every log line that has a `trace_id` stream label:

```yaml
- name: Loki
  uid: loki
  type: loki
  access: proxy
  url: http://loki:3100
  editable: false
  jsonData:
    maxLines: 1000
    derivedFields:
      - name: Trace ID
        matcherType: label
        matcherRegex: 'trace_id'
        datasourceUid: tempo
        url: '$${__value.raw}'
        urlDisplayLabel: 'Trace ID'
```

- `matcherType: label` — matches the `trace_id` stream label directly (trace context is stored as a label, not embedded in the log body, when using OTLP ingestion)
- `url: '$${__value.raw}'` — `$$` is the provisioning escape for a literal `$`; at runtime Grafana substitutes the extracted label value as the trace ID query to Tempo

**5. Deploy**

```bash
cd compose/
docker compose -f compose.dev.yaml up -d
```

**6. Generate Traffic**

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguages": ["es", "fr"]}'
```

**7. Verify log-to-trace correlation**

Open Grafana (http://localhost:3000) → Explore → Loki

Run the query:

```logql
{service_name="translation-frontend"}
```

Expand a log line — a **Trace ID** link appears at the bottom of the detail panel. Click it to open the corresponding trace in Tempo.

**8. Verify trace-to-log correlation**

Open Grafana → Explore → Tempo

Search for recent traces from `translation-frontend`. Open a trace and click the **Logs** button at the top of the trace view. Grafana queries Loki and displays the logs for that service scoped to the same trace.

### 🤖 AI Checkpoint

**Prompt:** "Why does Grafana's Loki derived field use `matcherType: label` instead of a regex when logs are ingested via the OTel Collector's OTLP protocol?"

**Evaluate the response:** Should explain that the OTLP→Loki exporter promotes trace context (`trace_id`, `span_id`) to Loki stream labels rather than embedding them in the log body. A label matcher is therefore more reliable than a body regex for this ingestion path.

### 📚 Resources

- [Grafana Loki derived fields](https://grafana.com/docs/grafana/latest/datasources/loki/configure-loki-data-source/#derived-fields)
- [Grafana Tempo trace to logs](https://grafana.com/docs/grafana/latest/datasources/tempo/configure-tempo-data-source/#trace-to-logs)
- [Grafana provisioning — use of the special character $](https://grafana.com/docs/grafana/latest/administration/provisioning/#use-of-the-special-character-)
