# Lab: Deploying Tempo

### 🎯 Lab Goal

Add Tempo to your observability stack to enable distributed tracing. Learn how Tempo stores traces, understand the OTLP protocol, and send a test trace to verify the setup.

### 📝 Overview & Concepts

Grafana Tempo is a high-volume distributed tracing backend. Unlike traditional tracing systems that index trace data extensively, Tempo takes a minimalist approach:

- **No indexing by default**: Traces are stored as complete objects
- **Query by trace ID**: Fast retrieval when you know the trace ID
- **Integration with metrics**: Uses Prometheus exemplars to link metrics to traces
- **OTLP-native**: Receives traces via OpenTelemetry Protocol (OTLP)

Tempo is designed for **high-cardinality**, **high-volume** tracing where you might generate millions of traces per day. Instead of indexing every span attribute, Tempo relies on:

1. **Direct trace ID lookup** - Fast when you have the ID
2. **Metrics-to-traces correlation** - Use Prometheus exemplars to find trace IDs
3. **Service graph** - Auto-generated from spans showing service dependencies

In this lab, you'll:

- Deploy Tempo alongside Prometheus and Loki

### 📋 Tasks

1. **Create Tempo Configuration**

   Create `compose/tempo-config.yaml`:

   ```yaml
   server:
     http_listen_port: 3200

   distributor:
     receivers:
       otlp:
         protocols:
           grpc:
             endpoint: 0.0.0.0:4317
           http:
             endpoint: 0.0.0.0:4318

   storage:
     trace:
       backend: local
       local:
         path: /var/tempo/traces
       wal:
         path: /var/tempo/wal

   query_frontend:
     search:
       max_duration: 0s
   ingester:
     max_block_duration: 5m

   compactor:
     compaction:
       block_retention: 72h
   ```

2. **Create Docker Compose File for Tempo**

   Open the `compose.observability.yaml` and add the following configuration for Tempo. If the file doesn't exist, create a new file under the `compose` folder. Make sure not to include duplicated elements or top-level fields:

   ```yaml
   services:
     tempo:
       image: grafana/tempo:2.10.1
       container_name: tempo
       command:
         - '-config.file=/etc/tempo/tempo.yaml'
         - '-target=all'
       volumes:
         - ./tempo.yaml:/etc/tempo/tempo.yaml:ro
         - tempo-data:/var/tempo
       ports:
         - '3200:3200'
       networks:
         - observability
       restart: unless-stopped

   volumes:
     tempo-data:
   ```

3. **Start Tempo**

   From the `compose/` directory:

   ```bash
   docker compose up
   ```

4. **Verify Tempo is Running**

   Check container status:

   ```bash
   docker compose ps
   ```

   Test the Tempo API:

   ```bash
   # Check ready status
   curl http://localhost:3200/ready

   # Check metrics endpoint
   curl http://localhost:3200/metrics | head -20
   ```

5. **Add Tempo to Prometheus Scrape Targets**

   Edit `compose/prometheus.yml` to add Tempo:

   ```yaml
   scrape_configs:
     - job_name: 'prometheus'
       static_configs:
         - targets: ['localhost:9090']

     - job_name: 'loki'
       static_configs:
         - targets: ['loki:3100']

     - job_name: 'tempo'
       static_configs:
         - targets: ['tempo:3200']
   ```

   Reload Prometheus:

   ```bash
   docker compose restart prometheus
   ```

   Verify in Prometheus UI → Status → Targets that `tempo` job shows as "UP".

6. **Check Tempo Metrics**

   In Prometheus UI (http://localhost:9090), try these queries:
   - `tempo_ingester_blocks_flushed_total` - Number of trace blocks written to storage
   - `tempo_distributor_spans_received_total` - Total spans received
   - `tempo_query_frontend_queries_total` - Number of queries executed

### 🤖 AI Checkpoints

1. **Tempo's Architecture:**

   Ask your AI assistant: "I configured Tempo with a distributor, ingester, compactor, and query_frontend. What role does each component play in Tempo's architecture, and why does Tempo use this modular design?"

   **What to evaluate:** Does it explain that the distributor receives traces via OTLP, the ingester buffers and writes traces to storage, the compactor merges trace blocks for efficient storage, and the query_frontend handles trace lookups? Does it mention that this design allows horizontal scaling?

2. **OTLP Receivers:**

   Ask: "In my Tempo config, I enabled OTLP receivers on both gRPC (port 4317) and HTTP (port 4318). What's the difference between these two protocols, and when would I use one over the other?"

   **What to evaluate:** Does it explain that gRPC is more efficient for high-volume tracing with binary encoding and multiplexing? Does it mention that HTTP is easier to use with curl, simpler for debugging, and works better through proxies? Does it explain both use the same OTLP data format?

3. **Tempo's Query Model:**

   Ask: "Tempo doesn't index span attributes by default. How would applications find traces if they can't search by attributes like http.status_code=500?"

   **What to evaluate:** Does it mention direct trace ID lookup when you have the ID? Does it explain using Prometheus exemplars to link metrics to traces? Does it mention service graphs for dependency visualization? Does it explain the trade-off: minimal indexing reduces storage costs but requires external correlation with metrics?

4. **Storage and Retention:**

   Ask: "My Tempo config uses local storage with a 72-hour block retention. What happens to traces after 72 hours? What storage backends does Tempo support for production environments?"

   **What to evaluate:** Does it explain that traces older than 72 hours are deleted by the compactor? Does it mention that Tempo supports object storage like S3, GCS, and Azure Blob Storage for production? Does it explain why object storage is preferred (durability, scalability, cost)?

### 📚 Resources

- [Tempo Documentation](https://grafana.com/docs/tempo/latest/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [OpenTelemetry Trace Data Model](https://opentelemetry.io/docs/concepts/signals/traces/)
