# Lab: Deploying Grafana

### 🎯 Lab Goal

Deploy Grafana as the unified visualization layer and configure data sources for Prometheus, Loki, and Tempo. Learn to create a simple dashboard that combines metrics, logs, and traces.

### 📝 Overview & Concepts

Grafana is an open-source visualization and analytics platform that serves as the "single pane of glass" for your observability stack. Key concepts:

- **Data Sources**: Connections to backends (Prometheus, Loki, Tempo)
- **Dashboards**: Collections of panels showing visualizations
- **Provisioning**: Automatic configuration via files (vs manual UI setup)
- **Correlation**: Linking between metrics, logs, and traces

Grafana excels at:

- **Multi-source queries**: Single dashboard pulling from multiple backends
- **Correlation**: Click on a metric to see related logs and traces
- **Templating**: Dynamic dashboards with variables
- **Alerting**: Alert rules based on query results

In this lab, you'll:

- Deploy Grafana with provisioned data sources
- Verify connectivity to Prometheus, Loki, and Tempo

### 📋 Tasks

1. **Create Grafana Data Sources Configuration**

   Create `compose/grafana-datasources.yaml`:

   ```yaml
   apiVersion: 1

   datasources:
     - name: Prometheus
       type: prometheus
       access: proxy
       url: http://prometheus:9090
       isDefault: true
       editable: false
       jsonData:
         timeInterval: 15s
         httpMethod: POST

     - name: Loki
       type: loki
       access: proxy
       url: http://loki:3100
       editable: false
       jsonData:
         maxLines: 1000

     - name: Tempo
       type: tempo
       access: proxy
       url: http://tempo:3200
       editable: false
       jsonData:
         tracesToLogsV2:
           datasourceUid: Loki
           tags: ['job', 'instance']
         tracesToMetrics:
           datasourceUid: Prometheus
         serviceMap:
           datasourceUid: Prometheus
   ```

   **Key settings:**
   - `access: proxy` - Grafana queries the backend (not browser)
   - `url: http://prometheus:9090` - Uses Docker network service names
   - `tracesToLogsV2` - Enables trace-to-log correlation
   - `isDefault: true` - Makes Prometheus the default data source

2. **Create Docker Compose File for Grafana**

   Open the `compose.observability.yaml` and add the following configuration for Grafana. If the file doesn't exist, create a new file under the `compose` folder. Make sure not to include duplicated elements or top-level fields:

   ```yaml
   services:
     grafana:
       image: grafana/grafana:12.3
       container_name: grafana
       environment:
         - GF_AUTH_ANONYMOUS_ENABLED=true
         - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
         - GF_SECURITY_ADMIN_PASSWORD=admin
       volumes:
         - ./grafana-datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml:ro
         - grafana-data:/var/lib/grafana
       ports:
         - '3000:3000'
       networks:
         - observability
       restart: unless-stopped
       depends_on:
         - prometheus
         - loki
         - tempo

   volumes:
     grafana-data:
   ```

3. **Start Grafana**

   From the `compose/` directory:

   ```bash
   docker compose up
   ```

4. **Access Grafana**
   - Open http://localhost:3000 in your browser
   - You should automatically be logged in (anonymous auth enabled)
   - You'll see the Grafana home page

5. **Verify Data Sources**
   - Navigate to **Connections → Data Sources** (or **Configuration → Data Sources** in older versions)
   - You should see three data sources:
     - **Prometheus** (default)
     - **Loki**
     - **Tempo**

   Click on each data source and scroll to the bottom. Click **"Save & Test"** button. You should see a green success message for all three.

6. **Explore Prometheus Metrics**
   - Click **Explore** (compass icon) in the left sidebar
   - Ensure "Prometheus" is selected in the data source dropdown (top left)
   - Try these queries in the query builder:
     - `up` - Shows which services are up
     - `up{job="loki"}` - Filter by job label
     - `rate(prometheus_http_requests_total[5m])` - Request rate

   Switch between "Table", "Graph", and "Stats" visualizations.

### 🤖 AI Checkpoints

1. **Data Source Configuration:**

   Ask your AI assistant: "In my Grafana datasources.yaml, I set 'access: proxy' for all data sources. What does this mean? How is it different from 'access: direct', and why would proxy mode be preferred?"

   **What to evaluate:** Does it explain that 'proxy' means the Grafana server makes requests to data sources on behalf of the browser? Does it mention 'direct' means the browser makes requests directly to data sources? Does it explain security benefits: with proxy mode, data sources don't need to be publicly accessible or have CORS configured?

2. **Understanding Correlation:**

   Ask: "Explain the 'tracesToLogsV2' configuration in my Tempo data source. How does Grafana use the 'tags: [job, instance]' setting to link traces to logs?"

   **What to evaluate:** Does it explain that Grafana extracts these tag values from trace spans and uses them to construct LogQL queries? Does it mention that when viewing a trace, you'll see a link to related logs? Does it explain that this requires consistent labeling: your traces and logs must both have matching 'job' and 'instance' labels?

3. **Data Source Settings:**

   Ask: "In my Prometheus data source config, I set 'timeInterval: 15s' and 'httpMethod: POST'. What do these settings control, and why would I configure them?"

   **What to evaluate:** Does it explain that 'timeInterval' sets the minimum step size for range queries, aligning with Prometheus scrape intervals? Does it mention that 'httpMethod: POST' is useful for queries with long URLs or many labels? Does it explain why matching timeInterval to your scrape interval (15s in this lab) prevents querying for data that doesn't exist?

4. **Provisioning vs Manual Configuration:**

   Ask: "I configured Grafana data sources using a provisioning file (grafana-datasources.yaml). What are the advantages of provisioning over manually adding data sources through the UI?"

   **What to evaluate:** Does it mention that provisioned data sources are version-controlled and reproducible? Does it explain that they're automatically configured on startup, useful for multiple environments? Does it mention that provisioned data sources can be marked as 'editable: false' to prevent accidental changes?

### 📚 Resources

- [Grafana Data Sources Documentation](https://grafana.com/docs/grafana/latest/datasources/)
- [Grafana Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
