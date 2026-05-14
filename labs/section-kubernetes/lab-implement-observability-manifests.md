# Lab: Write the Observability Manifests

## 🎯 Lab Goal

Write Kubernetes manifests for the full observability stack (OTel Collector, Prometheus, Loki, Tempo, Grafana, and kube-state-metrics). The key challenge is that Docker Compose uses bind-mounted config files; in Kubernetes those files become ConfigMaps.

## 📝 Overview & Concepts

The `compose/compose.observability.yaml` file defines six services. Several of them mount configuration files from the `compose/` directory into the container:

```
Prometheus     ← prometheus.yaml
Loki           ← loki-config.yaml
Tempo          ← tempo-config.yaml
OTel Collector ← otel-collector-config.yaml
Grafana        ← grafana-datasources.yaml
```

In Docker Compose, those files reach the container as a **bind mount**: a host path is mounted directly into the container (`./prometheus.yaml:/etc/prometheus/prometheus.yaml:ro`). In Kubernetes, there is no guarantee the config file exists on the node's filesystem. The solution is a **ConfigMap**: a Kubernetes resource that stores file content in the cluster and mounts it as a volume inside the pod.

The workflow for each service that needs a config file:

1. Copy the config file to `k8s/observability/configs/`
2. Write a `Deployment` that mounts a ConfigMap at the expected path inside the container
3. In the next lab, Kustomize's `configMapGenerator` reads each file in `configs/` and generates the ConfigMap resources automatically

This means the `Deployment` manifests you write here will reference ConfigMap names that do not yet exist as files. Kustomize creates them. That is the intended workflow.

## 📋 Tasks

> **Try with AI:** If you would prefer to generate these manifests, use this prompt: _"I have an observability stack in `compose/compose.observability.yaml` with config files in `compose/`. Generate Kubernetes manifests for all services in `k8s/observability/`. Config files are bind-mounted in Compose; in Kubernetes they should be mounted from ConfigMaps using a `subPath` volume mount. Also add kube-state-metrics using image `registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.18.0` with the required RBAC resources."_ Verify every `subPath` value, every `configMap.name` reference, and the RBAC for kube-state-metrics before saving.

**1. Review the compose file and config files**

Open `compose/compose.observability.yaml`. For each service, note the image, ports, and which config file is bind-mounted.

Also glance at the config files themselves (`compose/prometheus.yaml`, `compose/loki-config.yaml`, etc.) to understand which path each file needs to be mounted at inside the container.

**2. Create the directory structure**

```bash
mkdir -p k8s/observability/configs
```

**3. Copy the config files**

The config files in `compose/` are already production-ready. Copy them directly to the Kubernetes configs directory:

```bash
cp compose/otel-collector-config.yaml  k8s/observability/configs/
cp compose/prometheus.yaml             k8s/observability/configs/
cp compose/loki-config.yaml            k8s/observability/configs/
cp compose/tempo-config.yaml           k8s/observability/configs/
cp compose/grafana-datasources.yaml    k8s/observability/configs/
```

> ⚠️ **After copying, open `k8s/observability/configs/prometheus.yaml` and add a scrape job for kube-state-metrics.** The Compose config doesn't know about kube-state-metrics (it is Kubernetes-only), so its scrape job is missing from the copied file. Without it, Prometheus will never scrape kube-state-metrics even though the pod is running. Add the following entry at the end of the `scrape_configs` list:
>
> ```yaml
>   - job_name: 'kube-state-metrics'
>     static_configs:
>       - targets: ['kube-state-metrics:8080']
> ```

**4. Create `k8s/observability/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: observability
```

**5. Write `k8s/observability/otel-collector.yaml`**

The OTel Collector receives telemetry from the `app` namespace and forwards it to Prometheus, Loki, and Tempo. Read this manifest carefully: the `volumeMounts` and `volumes` blocks are the Kubernetes equivalent of the Compose bind mount.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: otel-collector
  template:
    metadata:
      labels:
        app.kubernetes.io/name: otel-collector
    spec:
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.146.1
          args:
            - --config=/etc/otel-collector-config.yaml
          ports:
            - containerPort: 4317
            - containerPort: 4318
            - containerPort: 8888
            - containerPort: 8889
          volumeMounts:
            - name: config
              mountPath: /etc/otel-collector-config.yaml
              subPath: otel-collector-config.yaml
      volumes:
        - name: config
          configMap:
            name: otel-collector-config
---
apiVersion: v1
kind: Service
metadata:
  name: otel-collector
spec:
  selector:
    app.kubernetes.io/name: otel-collector
  ports:
    - name: grpc
      port: 4317
      targetPort: 4317
    - name: http
      port: 4318
      targetPort: 4318
    - name: internal-metrics
      port: 8888
      targetPort: 8888
    - name: metrics
      port: 8889
      targetPort: 8889
```

The `volumes` block declares a volume backed by the ConfigMap `otel-collector-config`. The `volumeMounts` block mounts that volume at the path the container expects. The `subPath: otel-collector-config.yaml` mounts only that specific file rather than the whole ConfigMap as a directory.

The ConfigMap named `otel-collector-config` will be generated by Kustomize in the next lab.

**6. Write manifests for Prometheus, Loki, Tempo, and Grafana**

Apply the same pattern from step 5 to each remaining service. The structure is identical: a `Deployment` with `volumes` + `volumeMounts` referencing a ConfigMap, and a `Service` exposing the correct port.

Key values for each service:

| Service    | Image                    | Port | Config mount path                                        | ConfigMap name        | subPath                    |
| ---------- | ------------------------ | ---- | -------------------------------------------------------- | --------------------- | -------------------------- |
| Prometheus | `prom/prometheus:v3.9.1` | 9090 | `/etc/prometheus/prometheus.yaml`                        | `prometheus-config`   | `prometheus.yaml`          |
| Loki       | `grafana/loki:3.6.6`     | 3100 | `/etc/loki/loki.yaml`                                    | `loki-config`         | `loki-config.yaml`         |
| Tempo      | `grafana/tempo:2.10.1`   | 3200, **4317, 4318** | `/etc/tempo/tempo.yaml`                                  | `tempo-config`        | `tempo-config.yaml`        |
| Grafana    | `grafana/grafana:12.3`   | 3000 | `/etc/grafana/provisioning/datasources/datasources.yaml` | `grafana-datasources` | `grafana-datasources.yaml` |

> ⚠️ **For Tempo, expose all three ports** (3200, 4317, 4318) as `containerPort` entries in the Deployment and as entries in the Service. Port 3200 is Tempo's HTTP API (used by Grafana and Prometheus). Ports 4317 and 4318 are the OTLP gRPC and HTTP receivers — the OTel Collector sends traces to `tempo:4317`. If these ports are missing from the Service, the Collector's connection will be silently dropped and no trace data will reach Tempo.

For **Prometheus**, add these startup args:

```
--config.file=/etc/prometheus/prometheus.yaml
--storage.tsdb.path=/prometheus
--storage.tsdb.retention.time=15d
```

For **Loki** and **Tempo**, add these startup args (adjust path from the table):

```
-config.file=<mount path>
-target=all
```

For **Loki**, add the following configuration under `ingester` in the `loki-config.yaml`:

```
ingester:
  lifecycler:
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
  chunk_idle_period: 5m
  chunk_retain_period: 30s
  wal:
    dir: /loki/wal
```

For **Grafana**, use environment variables instead of startup args:

```
GF_AUTH_ANONYMOUS_ENABLED=true
GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
GF_SECURITY_ADMIN_PASSWORD=admin
```

**7. Write `k8s/observability/kube-state-metrics.yaml`**

kube-state-metrics reads the Kubernetes API to expose cluster-level metrics. Because it reads cluster-wide resources, it needs a `ServiceAccount`, `ClusterRole`, and `ClusterRoleBinding` in addition to the usual `Deployment` and `Service`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kube-state-metrics
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kube-state-metrics
rules:
  - apiGroups: ['']
    resources: [nodes, pods, services, namespaces, replicationcontrollers]
    verbs: [list, watch]
  - apiGroups: [apps]
    resources: [deployments, replicasets, statefulsets, daemonsets]
    verbs: [list, watch]
  - apiGroups: [batch]
    resources: [jobs, cronjobs]
    verbs: [list, watch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kube-state-metrics
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kube-state-metrics
subjects:
  - kind: ServiceAccount
    name: kube-state-metrics
    namespace: observability
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kube-state-metrics
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: kube-state-metrics
  template:
    metadata:
      labels:
        app.kubernetes.io/name: kube-state-metrics
    spec:
      serviceAccountName: kube-state-metrics
      containers:
        - name: kube-state-metrics
          image: registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.18.0
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: kube-state-metrics
spec:
  selector:
    app.kubernetes.io/name: kube-state-metrics
  ports:
    - port: 8080
      targetPort: 8080
```

The `ClusterRoleBinding` ties the `ClusterRole` (permissions) to the `ServiceAccount` (identity) in the `observability` namespace. The `serviceAccountName` field in the Deployment pod spec activates those permissions for the running pod.

## 🤖 AI Checkpoints

1. **Bind mounts vs. ConfigMaps:**

   Ask your AI assistant: "Why can't we use bind-mounted config files in a production Kubernetes cluster the way we do in Docker Compose? What are the tradeoffs between embedding a config file inline in a ConfigMap versus using Kustomize's `configMapGenerator` to load it from a file?"

   **What to evaluate:** Does it explain that Kubernetes pods run on cluster nodes which may not have the config file on their local filesystem, especially on managed cloud clusters? Does it contrast inline ConfigMap data (hard to read for large files, visible in `kubectl get cm`) with `configMapGenerator` (keeps configs as plain files in the repo, Kustomize generates the ConfigMap on apply and appends a content hash to the name for automatic rollouts on change)?

2. **The OTel Collector's dual role:**

   Ask: "In Docker Compose, the OTel Collector is on both the `app` and `observability` networks. In Kubernetes, how does the Collector receive telemetry from pods in the `app` namespace while its backends (Prometheus, Loki, Tempo) are in `observability`?"

   **What to evaluate:** Does it explain that in Kubernetes there are no separate networks to join; all pods in a cluster can reach any Service by its full DNS name regardless of namespace (unless NetworkPolicies restrict them)? Does it note that the Collector Service in `observability` is reachable from `app` via the cross-namespace FQDN? Does it mention that NetworkPolicies could be added to restrict this but are not needed for a learning setup?

3. **kube-state-metrics vs. the kubelet metrics:**

   Ask: "What is the difference between metrics from kube-state-metrics and metrics from the Kubernetes kubelet (exposed via the metrics-server or node exporters)? What kinds of questions can each answer?"

   **What to evaluate:** Does it explain that kube-state-metrics reads the Kubernetes API and produces metrics about the _desired state_: Pod counts, Deployment replicas, resource limits, condition statuses? Does it contrast this with kubelet/node exporter metrics about _actual resource usage_: CPU %, memory bytes, network I/O? Does it give a concrete example: kube-state-metrics tells you a Deployment has 2 desired replicas and 1 ready, while node exporter tells you the actual CPU used by the processes?

## 📚 Resources

- [Kubernetes ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [kube-state-metrics](https://github.com/kubernetes/kube-state-metrics)
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
