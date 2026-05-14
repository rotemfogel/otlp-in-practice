# Lab: Set Up Kustomize

## 🎯 Lab Goal

Wire the app and observability manifests together using Kustomize so the entire stack can be deployed with a single `kubectl apply -k k8s/` command. You will write three `kustomization.yaml` files and a `namespace.yaml` for the `app` namespace.

## 📝 Overview & Concepts

Kustomize adds a thin coordination layer:

- A `kustomization.yaml` in each directory tells Kustomize which files to include and what transformations to apply (namespace assignment, image tag pinning, ConfigMap generation)
- A root `kustomization.yaml` at `k8s/` references both sub-directories, so a single command deploys everything
- The `images:` block in the root overrides image tags across all resources without editing the base manifests

Kustomize is built into `kubectl` (no separate installation needed). Running `kubectl apply -k <dir>` renders all resources in that directory tree and applies them to the cluster.

## 📋 Tasks

**1. Create `k8s/app/namespace.yaml`**

The `app` namespace needs to be declared as a Kubernetes resource so Kustomize can deploy it:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: app
```

**2. Write `k8s/app/kustomization.yaml`**

This file sets the namespace for all resources in `k8s/app/` and lists the manifest files to include:

```yaml
namespace: app

resources:
  - namespace.yaml
  - frontend.yaml
  - worker.yaml
  - redis.yaml
```

Kustomize will inject `namespace: app` into every resource listed here. The `namespace.yaml` itself is a `Namespace` resource, which is exempt from namespace injection (Kustomize does not set a namespace on a Namespace resource).

**3. Write `k8s/observability/kustomization.yaml`**

The observability directory is similar but also uses `configMapGenerator` to create ConfigMaps from the files in `configs/`:

```yaml
namespace: observability

resources:
  - namespace.yaml
  - otel-collector.yaml
  - prometheus.yaml
  - loki.yaml
  - tempo.yaml
  - grafana.yaml
  - kube-state-metrics.yaml

configMapGenerator:
  - name: otel-collector-config
    files:
      - configs/otel-collector-config.yaml
  - name: prometheus-config
    files:
      - configs/prometheus.yaml
  - name: loki-config
    files:
      - configs/loki-config.yaml
  - name: tempo-config
    files:
      - configs/tempo-config.yaml
  - name: grafana-datasources
    files:
      - configs/grafana-datasources.yaml
```

Each entry in `configMapGenerator` reads the specified file and generates a `ConfigMap` resource with a content hash appended to the name (for example `otel-collector-config-7f8b2a4c`). Kustomize also rewrites all references to that ConfigMap name within the same directory, so the Deployment manifests that reference `otel-collector-config` are automatically updated to use the hashed name.

**4. Write the root `k8s/kustomization.yaml`**

The root file references both sub-directories and pins the image tags:

```yaml
resources:
  - app/
  - observability/

images:
  - name: lmacademy/web-translator-frontend
    newTag: v1.3.0
  - name: lmacademy/web-translator-worker
    newTag: v1.3.0
```

The `images:` block rewrites every `Deployment` across the entire resource tree that uses `lmacademy/web-translator-frontend` to `lmacademy/web-translator-frontend:v1.3.0`. This is the only place the tag needs to exist.

**5. Preview the rendered output**

Before applying anything, preview what Kustomize will generate:

```bash
kubectl kustomize k8s/
```

Scroll through the output and confirm:

- Every resource has a `namespace` field set to either `app` or `observability`
- The frontend and worker `Deployment` resources show `image: lmacademy/web-translator-frontend:v1.3.0` and `image: lmacademy/web-translator-worker:v1.3.0`
- ConfigMap resources appear for each observability config file, with a hash suffix in the name
- The `Deployment` resources in `k8s/observability/` reference the hashed ConfigMap names
- A `Namespace` resource for both `app` and `observability` appears

If anything looks wrong, fix the relevant `kustomization.yaml` and re-run `kubectl kustomize k8s/`.

> **Try with AI:** If you get stuck on any `kustomization.yaml` file, describe the problem to your AI assistant: _"Running `kubectl kustomize k8s/` shows [describe the issue]. Here is my `k8s/kustomization.yaml`: [paste content]. What needs to change?"_

## 🤖 AI Checkpoints

1. **Why image tags belong in the root kustomization:**

   Ask your AI assistant: "We pinned the frontend and worker image tags in the root `kustomization.yaml` rather than hardcoding them in `k8s/app/frontend.yaml` and `k8s/app/worker.yaml`. What is the benefit of managing image tags at the Kustomize level instead of inside each manifest?"

   **What to evaluate:** Does it explain that keeping `latest` or a variable tag in the base manifest and overriding it in the Kustomize overlay keeps the base manifest environment-agnostic? Does it mention that this pattern scales well to multiple environments (dev pins to `latest`, staging to a release candidate, production to a stable tag) without duplicating manifests? Does it note that the Kustomize `images:` block supports newTag, newName, and digest pinning?

2. **configMapGenerator and content hashing:**

   Ask: "Kustomize's `configMapGenerator` appends a hash to the ConfigMap name (e.g., `prometheus-config-abc123`). Why does it do this, and what problem does it solve?"

   **What to evaluate:** Does it explain that ConfigMap volume mounts in Kubernetes do not automatically cause pods to restart when the ConfigMap changes; the pod keeps using the old data until it restarts? Does it describe that by changing the ConfigMap name (via the hash), Kustomize forces the Deployment's pod template to reference the new name, which triggers a rolling restart automatically? Does it mention the tradeoff: the hashed name is harder to reference manually, so `configMapGenerator` pairs best with Kustomize-managed deployments rather than hand-edited manifests?

3. **kubectl kustomize vs. kubectl apply -k:**

   Ask: "What is the difference between `kubectl kustomize k8s/` and `kubectl apply -k k8s/`? When would you use one versus the other?"

   **What to evaluate:** Does it explain that `kubectl kustomize` only renders; it outputs the final YAML to stdout without touching the cluster, making it useful for inspection, CI diffing, or piping to other tools? Does it describe `kubectl apply -k` as rendering + applying in one step? Does it suggest that `kubectl kustomize k8s/ | kubectl diff -f -` is a useful pattern for previewing what would change before applying?

## 📚 Resources

- [Kustomize documentation](https://kubectl.docs.kubernetes.io/references/kustomize/)
- [configMapGenerator reference](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/configmapgenerator/)
- [Kustomize images transformer](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/images/)
