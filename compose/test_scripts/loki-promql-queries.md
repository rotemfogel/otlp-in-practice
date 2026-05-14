# Loki Metrics - PromQL Queries

This document contains useful PromQL queries to monitor your Loki instance through Prometheus.

## Prerequisites

Make sure Prometheus is scraping Loki metrics. Check your `prometheus.yaml` configuration includes Loki as a target.

## Basic Health Checks

### 1. Check if Loki is up

```promql
up{job="loki"}
```

**Expected result:** `1` (means Loki is running)  
**What it means:** This tells you if Prometheus can successfully scrape metrics from Loki.

---

## Log Ingestion Metrics

### 2. Rate of logs ingested per second

```promql
rate(loki_distributor_lines_received_total[5m])
```

**What it means:** How many log lines Loki is receiving per second (averaged over 5 minutes).  
**Healthy value:** Should be > 0 if logs are being sent to Loki.

### 3. Total bytes received per second

```promql
rate(loki_distributor_bytes_received_total[5m])
```

**What it means:** Volume of log data Loki is ingesting (in bytes per second).  
**Use case:** Monitor data throughput and storage needs.

### 4. Failed log ingestion requests

```promql
rate(loki_request_duration_seconds_count{status_code!="200", route="/loki/api/v1/push"}[5m])
```

**What it means:** Number of failed attempts to send logs to Loki per second.  
**Healthy value:** Should be 0 or very low.

---

## Query Performance

### 5. Query request rate

```promql
rate(loki_request_duration_seconds_count{route=~"/loki/api/v1/query.*"}[5m])
```

**What it means:** How many queries Loki is handling per second.  
**Use case:** Monitor query load on your Loki instance.

### 6. Query duration (95th percentile)

```promql
histogram_quantile(0.95, rate(loki_request_duration_seconds_bucket{route=~"/loki/api/v1/query.*"}[5m]))
```

**What it means:** 95% of queries complete within this duration (in seconds).  
**Healthy value:** Typically < 1 second for simple queries.

---

## Storage Metrics

### 7. Active streams

```promql
loki_ingester_streams
```

**What it means:** Number of active log streams currently in memory.  
**Use case:** Monitor memory usage and cardinality.

### 8. Chunks created per second

```promql
rate(loki_ingester_chunks_created_total[5m])
```

**What it means:** Rate at which Loki creates new data chunks.  
**Use case:** Understand write patterns and storage behavior.

---

## Error Monitoring

### 9. Overall error rate

```promql
sum(rate(loki_request_duration_seconds_count{status_code=~"5.."}[5m])) by (route)
```

**What it means:** Server errors (5xx) grouped by endpoint.  
**Healthy value:** Should be 0.

### 10. Dropped log entries

```promql
rate(loki_distributor_lines_dropped_total[5m])
```

**What it means:** Log lines rejected due to rate limits or errors.  
**Healthy value:** Should be 0.

---

## How to Use These Queries

1. **In Prometheus UI:**
   - Open http://localhost:9090
   - Go to the "Graph" tab
   - Paste any query above
   - Click "Execute"

2. **In Grafana:**
   - Create a new panel
   - Select Prometheus as data source
   - Use these queries in the query editor
   - Choose appropriate visualization (Graph, Gauge, Table, etc.)

3. **For Alerts:**
   - Add these queries to your Prometheus `prometheus.yaml` alert rules
   - Example: Alert when `up{job="loki"} == 0` (Loki is down)

---

## Quick Validation Query Sequence

After running the validation script, check these in order:

1. `up{job="loki"}` - Is Loki running?
2. `rate(loki_distributor_lines_received_total[5m])` - Are logs being received?
3. `rate(loki_request_duration_seconds_count{route=~"/loki/api/v1/query.*"}[5m])` - Are queries working?
4. `loki_ingester_streams` - Are streams being created?

If all return expected values, your Loki instance is healthy! ✅
