# Lab: Deploying Prometheus

### 🎯 Lab Goal

Deploy Prometheus as part of our observability stack and learn to use its native UI to explore metrics and run basic PromQL queries.

### 📝 Overview & Concepts

Prometheus is a time-series database designed for storing and querying metrics. Unlike push-based systems, Prometheus uses a **pull model**: it scrapes metrics from target endpoints at regular intervals. This lab introduces you to:

- **Docker Compose service definition** for Prometheus
- **Self-scraping**: Prometheus monitors its own metrics
- **Prometheus UI**: Native web interface for running queries
- **PromQL basics**: Query language for aggregating and analyzing metrics

You'll deploy Prometheus as a standalone container before adding other observability components. This allows you to understand Prometheus independently before integrating it with Grafana.

### 📋 Tasks

1. **Create Prometheus Configuration**

   Navigate to the `compose/` directory and verify (or create) `prometheus.yml`:

   ```yaml
   global:
     scrape_interval: 15s
     evaluation_interval: 15s

   scrape_configs:
     - job_name: 'prometheus'
       static_configs:
         - targets: ['localhost:9090']
   ```

   This basic configuration tells Prometheus to scrape its own metrics endpoint every 15 seconds.

2. **Create Docker Compose File for Prometheus**

   Open the `compose.observability.yaml` and add the following configuration for Prometheus. If the file doesn't exist, create a new file under the `compose` folder:

   ```yaml
   services:
     prometheus:
       image: prom/prometheus:v3.9.1
       container_name: prometheus
       command:
         - '--config.file=/etc/prometheus/prometheus.yml'
         - '--storage.tsdb.path=/prometheus'
         - '--storage.tsdb.retention.time=15d'
       volumes:
         - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
         - prometheus-data:/prometheus
       ports:
         - '9090:9090'
       networks:
         - observability
       restart: unless-stopped

   volumes:
     prometheus-data:
   ```

3. **Create a root `compose.yaml` file:**
   We will manage our project via a root `compose.yaml` file. If you do not have one in the `compose` folder, create a new `compose.yaml` file and import the `compose.observability.yaml` file:

   ```yaml
   # Main Docker Compose file for OpenTelemetry Course
   # This file includes the observability stack and (soon) application

   include:
     - compose.observability.yaml

   # Shared networks for all services
   networks:
     observability:
       driver: bridge
       name: observability
   ```

4. **Start Prometheus**

   From the `compose/` directory:

   ```bash
   docker compose up
   ```

5. **Verify Prometheus is Running**

   Check container status:

   ```bash
   docker compose ps
   ```

   You should see the prometheus container with status "Up".

6. **Access Prometheus UI**
   - Open http://localhost:9090 in your browser
   - You should see the Prometheus web interface with a query bar at the top

7. **Explore Prometheus Metrics**

   Try these queries in the Prometheus UI:
   - **Current scrape duration**: `scrape_duration_seconds`
   - **Rate of HTTP requests**: `rate(prometheus_http_requests_total[5m])`
   - **Memory usage**: `process_resident_memory_bytes / 1024 / 1024` (converts to MB)
   - **Uptime**: `time() - process_start_time_seconds`

   Switch between "Table" and "Graph" views to see different visualizations.

8. **Check Scrape Targets**
   - Navigate to **Status → Targets** in the Prometheus UI
   - You should see the `prometheus` job with state "UP"
   - Note the "Last Scrape" time and "Scrape Duration"

### 🤖 AI Checkpoints

1. **Understanding PromQL Queries:**

   Ask your AI assistant: "Explain this PromQL query: `rate(prometheus_http_requests_total[5m])`. What does the rate() function do? Why do we need the [5m] range selector?"

   **What to evaluate:** Does it explain that `rate()` calculates per-second rate over a time window? Does it mention that rate() is used for counters (ever-increasing values)? Does it explain why [5m] provides a 5-minute lookback window for calculating the rate? Try the query in Prometheus with different time ranges like [1m] or [10m] - do the results match the AI's explanation?

2. **Prometheus Configuration:**

   Ask: "In this `prometheus.yml` configuration, what does 'scrape_interval: 15s' control? What happens if I make it too short or too long?"

   **What to evaluate:** Does it explain the trade-off between data granularity and resource usage? Does it mention that shorter intervals give more precise data but increase load? Does it explain that 15s is a common default? Check your actual Prometheus metrics - can you see data points every 15 seconds?

3. **Troubleshooting Prometheus:**

   Ask: "My Prometheus container started but I don't see any metrics when I query. How do I diagnose this issue?"

   **What to evaluate:** Does it suggest checking Status → Targets to verify scrape health? Does it mention looking at container logs with `docker compose logs prometheus`? Does it suggest verifying the config file is mounted correctly? Try its diagnosis steps on your running instance.

### 📚 Resources

- [Prometheus Getting Started Guide](https://prometheus.io/docs/prometheus/latest/getting_started/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Prometheus Configuration Documentation](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
