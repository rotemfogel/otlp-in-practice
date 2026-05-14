# Lab: Deploy the Translation Application to Kubernetes

## 🎯 Lab Goal

Deploy the fully instrumented translation application and the complete observability stack to a local Kubernetes cluster. The OpenTelemetry SDK configuration requires no code changes - only the deployment environment changes.

## 📝 Overview & Concepts

In the instrumentation sections you instrumented the frontend and worker under Docker Compose. The OpenTelemetry SDK configuration in both services uses OTLP export. In Kubernetes, the services are deployed across two namespaces:

- **`observability`**: Prometheus, Loki, Tempo, Grafana, OTel Collector
- **`app`**: frontend, worker, Redis

The OTel Collector spans both namespaces: it receives telemetry from the `app` namespace and forwards it to backends in the `observability` namespace. The frontend and worker are configured to reach the Collector at `otel-collector.observability.svc.cluster.local:4318`, the fully-qualified cross-namespace DNS name.

**Tools you'll use:**

- A local Kubernetes cluster (choose one: **Kind**, **Minikube**, **k3d**, or any other distribution). All tasks from Step 3 onwards use standard `kubectl` and work on any cluster.
- `kubectl`: Kubernetes CLI
- `kustomize` (built into `kubectl apply -k`): renders and applies layered YAML

## 📋 Tasks

**1. Prerequisites check**

Verify the required tools are installed:

```bash
kubectl version --client   # v1.28 or newer
docker info                # Docker daemon must be running
```

> **Note:** Before proceeding, ensure the services use Kubernetes-compatible environment variable handling. If you haven't done so already, complete the two refactoring labs at the end of the distributed systems section.

**2. Create a local Kubernetes cluster**

Choose the local Kubernetes distribution that works best for you. All three options produce a single-node cluster that is fully compatible with the manifests in this lab.

**Option A: Kind (Kubernetes in Docker):**

```bash
# Install (macOS)
brew install kind

# Create the cluster
kind create cluster --config k8s/kind-config.yaml --name opentelemetry
```

**Option B: Minikube:**

```bash
# Install (macOS)
brew install minikube

# Create the cluster
minikube start --profile opentelemetry --memory 8192 --cpus 4

# Or with fewer resources:
minikube start --profile opentelemetry --memory 4096 --cpus 2
```

Regardless of which option you chose, verify the cluster is ready:

```bash
kubectl cluster-info
kubectl get nodes
```

You should see one node in `Ready` state before continuing.

**3. Deploy the observability stack**

```bash
kubectl apply -k k8s/observability/
```

Wait for all pods to become ready (this may take 2-3 minutes as images are pulled):

```bash
kubectl -n observability get pods --watch
```

Expected pods: `prometheus`, `loki`, `tempo`, `grafana`, `otel-collector`, `kube-state-metrics`.

**4. Deploy the translation application**

```bash
kubectl apply -k k8s/
```

Watch the application pods start:

```bash
kubectl -n app get pods --watch
```

Expected: `frontend` (1 replicas), `worker` (1 replica), `redis` (1 replica).

**5. Port-forward to access services**

Open three terminal tabs and run one command in each:

```bash
# Terminal 1: Frontend application (mapped to 3001 to avoid clash with Grafana)
kubectl -n app port-forward svc/frontend 3001:3000

# Terminal 2: Grafana
kubectl -n observability port-forward svc/grafana 3000:3000

# Terminal 3: Prometheus
kubectl -n observability port-forward svc/prometheus 9090:9090
```

> **Minikube users:** use `minikube service` instead. Run each command in a separate terminal — it will print the local URL with a minikube-assigned port:
>
> ```bash
> minikube service frontend -n app --url
> minikube service grafana -n observability --url
> minikube service prometheus -n observability --url
> ```
>
> Use the printed URLs in place of `http://localhost:3001`, `http://localhost:3000`, and `http://localhost:9090` in the steps below.

**6. Generate translation traffic**

```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello Kubernetes!", "targetLanguages": ["es", "fr", "de"]}'
```

Send 5-10 requests. Once the application is responding, proceed to the next lab to systematically verify that all three telemetry signals are flowing through the pipeline.

## 🤖 AI Checkpoints

**Checkpoint 1: Kustomize structure**

**Prompt to your AI assistant:** "Explain what `kubectl apply -k k8s/` does differently compared to `kubectl apply -f`. What does Kustomize add? Walk through what the `k8s/kustomization.yaml` in this project does."

**What to evaluate:** The AI should explain that `-k` invokes Kustomize which renders base resources, applies patches (like the replica count), sets namespace on all resources, and optionally transforms images. It should not hallucinate features not present in the actual `kustomization.yaml`. Check the AI's answer against the actual file at `k8s/kustomization.yaml`.

**Checkpoint 2: Service discovery**

**Prompt:** "In our Docker Compose setup, the frontend connects to the OTel Collector at `http://otel-collector:4318`. In Kubernetes, the Collector and frontend are in different namespaces (`observability` and `app`). How should the frontend's `OTEL_EXPORTER_OTLP_ENDPOINT` be configured to reach the Collector across namespaces?"

**What to evaluate:** The correct answer is to use the fully-qualified DNS name: `http://otel-collector.observability.svc.cluster.local:4318`. The short name `otel-collector` only resolves within the same namespace. Check whether the AI picks up this cross-namespace detail accurately, and verify against `k8s/app/frontend.yaml`.

## 📚 Resources

- [Kubernetes Kustomize documentation](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)
- [kind: Kubernetes in Docker](https://kind.sigs.k8s.io/docs/user/quick-start/)
- [OpenTelemetry Kubernetes deployment guide](https://opentelemetry.io/docs/kubernetes/)
