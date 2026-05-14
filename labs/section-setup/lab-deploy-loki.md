# Lab: Deploying Loki

### 🎯 Lab Goal

Add Loki to your observability stack to enable log aggregation. Learn how Loki's label-based indexing differs from traditional log systems, and practice querying logs with LogQL.

### 📝 Overview & Concepts

Loki is a horizontally scalable, highly available log aggregation system inspired by Prometheus. Unlike traditional log systems that index the full text of log messages, Loki only indexes **labels** (metadata like service name, environment, level). This design makes Loki:

- **Cost-effective**: Much less storage and compute than full-text indexing
- **Prometheus-like**: Uses similar label-based querying (LogQL)
- **Grafana-native**: Seamless integration with Grafana for visualization

In this lab, you'll:

- Deploy Loki alongside Prometheus
- Understand Loki's configuration and storage
- Use LogQL to query Loki's own logs
- Learn how Loki indexes labels, not content

### 📋 Tasks

1. **Create Loki Configuration**

   Create `compose/loki-config.yaml`:

   ```yaml
   auth_enabled: false

   server:
     http_listen_port: 3100

   ingester:
     lifecycler:
       ring:
         kvstore:
           store: inmemory
         replication_factor: 1
     chunk_idle_period: 5m
     chunk_retain_period: 30s

   schema_config:
     configs:
       - from: 2024-01-01
         store: tsdb
         object_store: filesystem
         schema: v13
         index:
           prefix: index_
           period: 24h

   storage_config:
     tsdb_shipper:
       active_index_directory: /loki/index
       cache_location: /loki/cache
     filesystem:
       directory: /loki/chunks

   limits_config:
     retention_period: 168h

   compactor:
     working_directory: /loki/compactor
     compaction_interval: 10m
     retention_enabled: true
     delete_request_store: filesystem
   ```

2. **Update Docker Compose to Include Loki**

   Open the `compose.observability.yaml` and add the following configuration for Loki. If the file doesn't exist, create a new file under the `compose` folder. Make sure not to include duplicated elements or top-level fields:

   ```yaml
   services:
     loki:
       image: grafana/loki:3.6.6
       container_name: loki
       user: root
       command:
         - '-config.file=/etc/loki/loki.yaml'
         - '-target=all'
       volumes:
         - ./loki.yaml:/etc/loki/loki.yaml:ro
         - loki-data:/loki
         - loki-wal:/wal
       ports:
         - '3100:3100'
       networks:
         - observability
       restart: unless-stopped

   volumes:
     loki-data:
     loki-wal:
   ```

3. **Create a root `compose.yaml` file:**
   We will manage our project via a root `compose.yaml` file. If you do not have one in the `compose` folder, check the **Create a root `compose.yaml` file:** section of [Lab: Deploy Prometheus](lab-deploy-prometheus.md).
4. **Start Loki**

   From the `compose/` directory:

   ```bash
   docker compose up
   ```

   Run `docker compose down` if you had the Compose project running with Prometheus.

5. **Verify Loki is Running**

   Check both containers:

   ```bash
   # Check Loki
   docker compose ps

   # Verify network connectivity
   docker network inspect observability
   ```

6. **Test Loki API**

   Loki exposes a REST API on port 3100:

   ```bash
   # Check health
   curl http://localhost:3100/ready

   # Check metrics
   curl http://localhost:3100/metrics

   # List label names (may be empty at first)
   curl http://localhost:3100/loki/api/v1/labels
   ```

7. **Check Loki Metrics in Prometheus**

   Loki exposes Prometheus metrics. Add Loki as a scrape target:

   Edit `compose/prometheus.yml` and add this scrape config:

   ```yaml
   scrape_configs:
     - job_name: 'prometheus'
       static_configs:
         - targets: ['localhost:9090']

     - job_name: 'loki'
       static_configs:
         - targets: ['loki:3100']
   ```

   Reload Prometheus configuration:

   ```bash
   docker compose restart prometheus
   ```

   Wait 15-30 seconds, then check Prometheus UI (http://localhost:9090) → Status → Targets. You should see the `loki` job with state "UP".

### 🤖 AI Checkpoints

1. **Understanding Loki Architecture:**

   Ask your AI assistant: "Explain how Loki's indexing strategy differs from Elasticsearch. Why does Loki only index labels instead of full log content?"

   **What to evaluate:** Does it explain that Loki trades query flexibility for cost and scale? Does it mention that you can still search log content (just not indexed)? Does it explain how this makes Loki 10-100x cheaper to operate? Think about your use case - when would you need full-text search vs. label-based filtering?

2. **LogQL Query Syntax:**

   Ask: "Explain this LogQL query: `{job="webapp"} |= "error" | json | level="ERROR"`. What does each part do?"

   **What to evaluate:** Does it explain the stream selector `{job="webapp"}`? Does it describe `|=` as a line filter (grep)? Does it explain `| json` as a parser? Does it show how `level="ERROR"` filters parsed fields? Try variations of this query with your test logs.

3. **Loki vs. Traditional Logging:**

   Ask: "I'm used to tools like Splunk or Elasticsearch for logs. What are the main operational trade-offs I should expect when using Loki?"

   **What to evaluate:** Does it mention that Loki requires proper labeling at ingestion time? Does it explain you can't retroactively add labels? Does it discuss the query performance characteristics (label filters are fast, content grep is slower)? Does it mention that Loki works best with structured logs?

### 📚 Resources

- [Loki Documentation](https://grafana.com/docs/loki/latest/)
- [LogQL Query Language](https://grafana.com/docs/loki/latest/query/)
- [Loki Configuration Reference](https://grafana.com/docs/loki/latest/configure/)
