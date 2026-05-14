# Lab: Deploy OpenTelemetry Collector

### 🎯 Lab Goal

Deploy the OpenTelemetry Collector to act as the central telemetry aggregation layer between your application services and the observability backends. By the end of this lab, the Collector will be ready to receive OTLP data from your applications and route it to Prometheus, Loki, and Tempo.

### 📝 Overview & Concepts

Before instrumenting your applications, you need to deploy the OpenTelemetry Collector. The Collector serves as a vendor-agnostic middleman that:

- **Receives telemetry** from applications via OTLP (OpenTelemetry Protocol)
- **Processes data** through configurable pipelines (batching, filtering, sampling)
- **Exports to backends** like Prometheus (metrics), Loki (logs), and Tempo (traces)

**Why use a Collector?**

1. **Decoupling**: Applications only need to know about OTLP, not backend-specific protocols
2. **Flexibility**: Change backends without redeploying applications
3. **Centralized processing**: Apply sampling, filtering, and enrichment in one place
4. **Resilience**: Buffering protects against temporary backend outages

**Architecture:**

```
Frontend App (OTLP) → Collector  → Prometheus (metrics)
                                 → Loki (logs)
                                 → Tempo (traces)
```

The Collector has three main components:

- **Receivers**: Accept telemetry data (OTLP, Jaeger, Prometheus, etc.)
- **Processors**: Transform, filter, or enrich data (batch, memory_limiter, etc.)
- **Exporters**: Send data to backends (Tempo, Prometheus, Loki, etc.)

These components are connected via **pipelines** that define the data flow for each signal type (traces, metrics, logs).

### 📋 Tasks

**1. Review the Application Architecture**

Navigate to the project root and examine the application structure:

```bash
ls -la compose/
# You should see: compose.dev.yaml, compose.prod.yaml, compose.app.yaml, compose.observability.yaml
ls -la code/
# You should see: frontend/ worker/ (application source code)
```

The application has:

- `code/` - Frontend, worker source code
- `compose/compose.app.yaml` - Base application service definitions
- `compose/compose.observability.yaml` - Prometheus, Loki, Tempo, Grafana
- `compose/compose.dev.yaml` - Development environment entry point
- `compose/compose.prod.yaml` - Production environment entry point

**2. Create OpenTelemetry Collector Configuration**

Create `compose/otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true
  prometheus:
    endpoint: 0.0.0.0:8889
  otlphttp/loki:
    endpoint: http://loki:3100/otlp
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/loki]
```

**Key configuration elements:**

- **OTLP Receiver**: Accepts both gRPC (4317) and HTTP (4318) protocols
- **Batch Processor**: Groups telemetry data for efficient export (10s timeout or 1024 items)
- **Memory Limiter**: Prevents out-of-memory errors by limiting to 512 MiB
- **Exporters**: Send data to Tempo (traces), Prometheus (metrics), and Loki (logs)
- **Pipelines**: Define separate data flows for traces, metrics, and logs

**3. Update Observability Stack to Include Collector**

Edit `compose/compose.observability.yaml` to add the Collector service at the beginning:

```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.146.1
    container_name: otel-collector
    command: ['--config=/etc/otel-collector-config.yaml']
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml:ro
    ports:
      - '4317:4317' # OTLP gRPC
      - '4318:4318' # OTLP HTTP
      - '8889:8889' # Prometheus metrics exporter
    networks:
      - observability
      - app
    restart: unless-stopped
    depends_on:
      - prometheus
      - loki
      - tempo

  # ... existing services (prometheus, loki, tempo, grafana) ...
```

**Important notes:**

- Uses `opentelemetry-collector-contrib` which includes additional exporters like Loki
- Connects to both `observability` and `app` networks so applications can reach it
- Exposes port 8889 for Prometheus to scrape the Collector's own metrics

**4. Update Prometheus to Scrape Collector Metrics**

Edit `compose/prometheus.yaml` to add the Collector as a scrape target:

```yaml
scrape_configs:
  # ... existing jobs (prometheus, loki, tempo, grafana) ...

  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector:8889']
```

This allows you to monitor the Collector's health and performance using its own metrics.

**5. Ensure Tempo Accepts OTLP**

Edit `compose/tempo-config.yaml` to ensure the distributor has OTLP receivers configured:

```yaml
distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318
```

This allows the Collector to send traces to Tempo via OTLP.

**6. Start the Complete Observability Stack**

From the `compose/` directory:

```bash
cd compose/
docker compose -f compose.dev.yaml down  # Stop existing services
docker compose -f compose.dev.yaml up -d # Start with Collector included
```

Wait for all services to start. You can monitor the startup with:

```bash
docker compose -f compose.dev.yaml logs -f otel-collector
```

**7. Verify Collector is Running**

```bash
# Check all services are up
docker compose -f compose.dev.yaml ps

# Check Collector logs - look for success messages
docker compose -f compose.dev.yaml logs otel-collector | tail -30

# You should see a message like:
# "Everything is ready. Begin running and processing data."
```

Test that the Collector endpoints are accessible:

```bash
# Test HTTP endpoint (should return 404, which confirms it's listening)
curl -i http://localhost:4318/

# Check Collector's own metrics are exposed
curl -s http://localhost:8889/metrics | head -20
```

If you see metrics output, the Collector is successfully running and ready to receive telemetry!

### 🤖 AI Checkpoint

**Understanding Collector Pipelines:**

Ask your AI assistant: "Explain this OpenTelemetry Collector pipeline configuration. What happens to a trace as it flows from the OTLP receiver through the processors to the exporters?"

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/tempo]
```

**What to evaluate:**

- Does it explain the sequential processing (receiver → processors → exporter)?
- Does it mention that `memory_limiter` prevents OOM and checks memory usage?
- Does it explain that `batch` groups spans for efficiency (reduces network calls)?
- Does it clarify that `otlp/tempo` must be defined in the `exporters` section?
- Ask: "What happens if I remove the batch processor?" - should mention more frequent exports and higher overhead

### 📚 Resources

- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [Collector Configuration Reference](https://opentelemetry.io/docs/collector/configuration/)
- [Collector Contrib Distribution](https://github.com/open-telemetry/opentelemetry-collector-contrib) (includes Loki exporter)
