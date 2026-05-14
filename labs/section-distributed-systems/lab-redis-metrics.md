# Lab: Redis Metrics with redis_exporter

### 🎯 Lab Goal

Add the `redis_exporter` sidecar to the stack so that Prometheus can scrape and store detailed Redis telemetry. After this lab you will have real-time visibility into queue depth, memory usage, connected clients, and command throughput directly in Grafana.

### 📝 What You'll Learn

- How to export metrics from infrastructure services (like Redis) that have no native OTel support
- How to add a new exporter service and wire it into Prometheus scraping
- How to use PromQL to explore queue and Redis health metrics

### 📋 Tasks

**1. Add `redis-exporter` to `compose/compose.app.yaml`**

Open `compose/compose.app.yaml` and add the `redis-exporter` service after the `redis` service:

```yaml
redis-exporter:
  image: oliver006/redis_exporter:v1.81.0-alpine
  container_name: redis-exporter
  environment:
    - REDIS_ADDR=redis://redis:6379
  ports:
    - '9121:9121'
  networks:
    - app
    - observability
  depends_on:
    redis:
      condition: service_healthy
  restart: unless-stopped
```

**2. Add the Redis scrape job to `compose/prometheus.yaml`**

Open `compose/prometheus.yaml` and add a new scrape job at the end of `scrape_configs`:

```yaml
- job_name: 'redis'
  static_configs:
    - targets: ['redis-exporter:9121']
```

**3. Deploy the exporter and reload Prometheus**

```bash
cd compose/
docker compose -f compose.dev.yaml up -d redis-exporter
docker compose -f compose.dev.yaml restart prometheus
```

**4. Verify the exporter is up**

```bash
curl -s http://localhost:9121/metrics | grep redis_up
```

Expected output:

```
redis_up 1
```

**5. Verify Prometheus is scraping the target**

Open Prometheus at http://localhost:9090 → Status → Targets and confirm the `redis` job shows `UP`.

**6. Explore Redis metrics in Grafana**

Open Grafana at http://localhost:3000 → Explore → Prometheus.

Try these queries:

| Query                            | What it shows                                |
| -------------------------------- | -------------------------------------------- |
| `redis_memory_used_bytes`        | Current memory consumed by Redis             |
| `redis_connected_clients`        | Active connections at this moment            |
| `rate(redis_commands_total[1m])` | Commands per second across all clients       |
| `redis_db_keys{db="db0"}`        | Total number of keys in the default database |

Generate some traffic first:

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "The quick brown fox jumps over the lazy dog", "targetLanguages": ["es", "fr", "de"]}'
```

Then re-run the Prometheus queries to see the metrics change.

### 🤖 AI Checkpoints

1. **Exporters vs. OTel Collector Receivers:**

   Ask your AI assistant: "What is the difference between a Prometheus exporter and the OpenTelemetry Collector's Prometheus receiver? When would you choose one over the other?"

   **What to evaluate:** Does it explain that a dedicated exporter (like `redis_exporter`) is a standalone sidecar that translates a specific service's internal state into Prometheus exposition format? Does it describe the OTel Collector's Prometheus receiver as a component that *scrapes* existing Prometheus endpoints and forwards data into the OTel pipeline? Does it explain that the two are complementary — an exporter produces the metrics, and the Collector can optionally enrich and forward them alongside application telemetry?

2. **Detecting Redis Problems with Metrics:**

   Ask: "Looking at metrics like `redis_memory_used_bytes`, `redis_connected_clients`, and `rate(redis_commands_total[1m])`, what thresholds or patterns would indicate Redis is under stress? How would you build an alert strategy around these?"

   **What to evaluate:** Does it explain that memory approaching `maxmemory` can trigger eviction policies and data loss? Does it mention that a spike in `rate(redis_commands_total[1m])` combined with high latency often signals overload? Does it discuss `redis_connected_clients` as a leading indicator and suggest pairing multiple metrics rather than alerting on a single one in isolation?

3. **The Exporter Network Configuration:**

   Ask: "The `redis-exporter` service in this lab is connected to both the `app` and `observability` networks. Why does it need both, and what would break if it could only reach one of them?"

   **What to evaluate:** Does it explain that the `app` network is required to reach the Redis instance (which only lives there), while the `observability` network is required to be reachable by Prometheus for scraping? Does it note that with only the `app` network, Prometheus couldn't scrape the exporter, and with only the `observability` network, the exporter couldn't connect to Redis at all? Does it mention this is a common pattern for "bridge" or "sidecar" services that span two isolated network segments?

### 📚 Resources

- [oliver006/redis_exporter](https://github.com/oliver006/redis_exporter)
- [Prometheus scrape configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config)
