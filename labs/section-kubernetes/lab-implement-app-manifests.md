# Lab: Write the Application Manifests

## 🎯 Lab Goal

Write Kubernetes manifests for the three application services (frontend, worker, and Redis) based on the existing Docker Compose configuration. By the end of this lab you will have `k8s/app/frontend.yaml`, `k8s/app/worker.yaml`, and `k8s/app/redis.yaml` ready for deployment.

## 📝 Overview & Concepts

In Docker Compose, a service is a single block of YAML: image, environment, ports, and network membership all in one place. Kubernetes splits that into at least two separate resources:

- A **Deployment**: describes the pod template, the container image, env vars, and restart behaviour
- A **Service**: provides a stable DNS name and load-balances traffic to matching pods

The connection between a Service and the pods it routes to is established through **labels and selectors**. A label on the pod template (e.g. `app.kubernetes.io/name: frontend`) must match the `selector` in the corresponding Service. This is the glue that makes the two resources work together.

Networking works differently too. In Compose, services on the same network reference each other by service name. In Kubernetes, services in different namespaces need a fully-qualified DNS name: `<service>.<namespace>.svc.cluster.local`. Because the OTel Collector lives in the `observability` namespace, the `OTEL_EXPORTER_OTLP_ENDPOINT` env var in both the frontend and worker must change.

## 📋 Tasks

> **Try with AI:** If you would rather have your AI assistant write these manifests, use this prompt: _"I have a Docker Compose file at `compose/compose.app.yaml`. Generate Kubernetes manifests for the frontend, worker, and Redis services in `k8s/app/`. One YAML file per service. Use `lmacademy/web-translator-frontend` and `lmacademy/web-translator-worker` as the image names. Both services send telemetry to an OTel Collector in a separate `observability` namespace, so update the OTLP endpoint to the cross-namespace FQDN."_ Review the output carefully before saving and check that labels match selectors.

**1. Review the source Compose file**

Open `compose/compose.app.yaml`. For each of the three services (`redis`, `frontend`, `worker`) note:

- The container image and any explicit version tags
- All environment variables
- Exposed ports (if any)

You will translate this information into Kubernetes manifests in the steps below.

**2. Create the `k8s/app/` directory**

```bash
mkdir -p k8s/app
```

**3. Write `k8s/app/redis.yaml`**

Redis is purely internal and never needs to be reached from outside the cluster. A `Deployment` paired with a `ClusterIP` Service is sufficient:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: redis
  template:
    metadata:
      labels:
        app.kubernetes.io/name: redis
    spec:
      containers:
        - name: redis
          image: redis:8-alpine
          ports:
            - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector:
    app.kubernetes.io/name: redis
  ports:
    - port: 6379
      targetPort: 6379
```

The `Service` named `redis` makes the pod reachable at the DNS name `redis` within the `app` namespace. This is why `REDIS_HOST=redis` in the frontend and worker works without any change.

**4. Write `k8s/app/worker.yaml`**

The worker pulls jobs from Redis and does not accept incoming connections, so it only needs a `Deployment`. Note the updated `OTEL_EXPORTER_OTLP_ENDPOINT`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: worker
  template:
    metadata:
      labels:
        app.kubernetes.io/name: worker
    spec:
      containers:
        - name: worker
          image: lmacademy/web-translator-worker
          env:
            - name: REDIS_HOST
              value: redis
            - name: REDIS_PORT
              value: '6379'
            - name: LOG_LEVEL
              value: info
            - name: SOURCE_LANGUAGE
              value: en
            - name: OTEL_SERVICE_NAME
              value: translation-worker
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: http://otel-collector.observability.svc.cluster.local:4318
```

The `OTEL_EXPORTER_OTLP_ENDPOINT` changed from `http://otel-collector:4318` (Compose) to the fully-qualified cross-namespace name. In Compose, `otel-collector` resolved because both services were on the same network. In Kubernetes the Collector is in the `observability` namespace, so the short name no longer resolves from the `app` namespace.

**5. Write `k8s/app/frontend.yaml`**

The frontend accepts incoming HTTP traffic, so it needs both a `Deployment` and a `Service`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: frontend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: frontend
    spec:
      containers:
        - name: frontend
          image: lmacademy/web-translator-frontend
          ports:
            - containerPort: 3000
          env:
            - name: REDIS_HOST
              value: redis
            - name: REDIS_PORT
              value: '6379'
            - name: PORT
              value: '3000'
            - name: LOG_LEVEL
              value: info
            - name: SOURCE_LANGUAGE
              value: en
            - name: OTEL_SERVICE_NAME
              value: translation-frontend
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: http://otel-collector.observability.svc.cluster.local:4318
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  selector:
    app.kubernetes.io/name: frontend
  ports:
    - port: 3000
      targetPort: 3000
```

## 🤖 AI Checkpoints

1. **Deployment vs. Service separation:**

   Ask your AI assistant: "In Docker Compose, `frontend` is a single block with image, ports, environment, and networks. Why does Kubernetes split this into a Deployment and a Service? What would happen if I only created the Deployment and skipped the Service?"

   **What to evaluate:** Does it explain that a Deployment manages the lifecycle of pods (replicas, rolling updates, restart policy) while a Service provides a stable virtual IP and DNS name that survives pod restarts and rescheduling? Does it note that without a Service, other pods could still reach the frontend directly by pod IP, but that IP changes every time the pod restarts, making it unreliable for service discovery?

2. **Cross-namespace DNS:**

   Ask: "Why does the OTLP endpoint need the full `otel-collector.observability.svc.cluster.local` name instead of just `otel-collector`? What does each segment of that DNS name mean?"

   **What to evaluate:** Does it break down the FQDN as `<service-name>.<namespace>.svc.<cluster-domain>`? Does it explain that Kubernetes DNS resolves short names within the same namespace only, so `otel-collector` from the `app` namespace would look for a service named `otel-collector` in `app`, and fail? Does it mention that `cluster.local` is the default cluster domain and is configurable?

3. **Resource requests and limits:**

   Ask: "The Compose file has no CPU or memory constraints. Should the Kubernetes manifests include `resources.requests` and `resources.limits`? What happens if I omit them?"

   **What to evaluate:** Does it explain that pods without resource requests are scheduled to any node without the scheduler knowing how demanding they are, which can lead to resource contention and node instability? Does it mention that limits prevent a runaway process from starving other pods? Does it note that for a learning environment it's fine to omit them or keep them loose, but production workloads should always define both?

## 📚 Resources

- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes Services](https://kubernetes.io/docs/concepts/services-networking/service/)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
