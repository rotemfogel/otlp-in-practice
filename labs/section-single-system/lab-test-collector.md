# Lab: Test & Monitor the Collector

### 🎯 Lab Goal

Verify that the OpenTelemetry Collector is working by sending test telemetry and checking that it reaches your observability backends.

### 📋 Tasks

**1. Send Test Trace to Collector**

```bash
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "test-app"}}
        ]
      },
      "scopeSpans": [{
        "scope": {"name": "test-instrumentation"},
        "spans": [{
          "traceId": "'$(openssl rand -hex 16)'",
          "spanId": "'$(openssl rand -hex 8)'",
          "name": "test-operation",
          "kind": 1,
          "startTimeUnixNano": "'$(date +%s)000000000'",
          "endTimeUnixNano": "'$(( $(date +%s) + 1 ))000000000'",
          "status": {"code": 0}
        }]
      }]
    }]
  }'
```

Wait 10 seconds (for the batch processor to flush).

**2. Verify Trace in Tempo**

Open Grafana at http://localhost:3000:

1. Go to **Explore** → Select **Tempo**
2. Click **Search** tab → **Run query**
3. Find your trace with service.name = "test-app"
4. Click on it to see the span details

**3. Check Collector Metrics**

Open Prometheus at http://localhost:9090 and verify the Collector is healthy:

```promql
# Collector is up
up{job="otel-collector"}

# Spans were received
otelcol_receiver_accepted_spans

# Spans were sent to Tempo
otelcol_exporter_sent_spans{exporter="otlp/tempo"}

# No errors
otelcol_receiver_refused_spans
otelcol_exporter_send_failed_spans
```

All metrics should show the Collector is receiving and forwarding data without errors.

### 🤖 AI Checkpoint

Ask your AI assistant: "Why should I use an OpenTelemetry Collector instead of having my application export directly to Prometheus, Tempo, and Loki? What are the trade-offs?"

Consider: decoupling, centralized processing, operational overhead, and when direct export might be acceptable.

### 📚 Resources

- [Collector Performance Best Practices](https://opentelemetry.io/docs/collector/scaling/)
- [OTLP Protocol Specification](https://opentelemetry.io/docs/specs/otlp/)
