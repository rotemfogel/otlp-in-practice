# Lab: Environment Setup

### 🎯 Lab Goal

The goal of this lab is to prepare your local development environment. You will ensure that you have all the necessary tools installed and that you have the course code available locally.

### 📝 Overview & Concepts

To run a Kubernetes-based observability stack locally, we rely on a few industry-standard tools:

- **Docker:** To run our containers.
- **Kubernetes (K8s):** To orchestrate our containers. You might use Docker Desktop, Minikube, or Kind.

### 📋 Tasks

1.  **Clone the Repository**
    - Clone the course repository to your local machine.
    - Navigate into the project directory.

2.  **Verify Docker**
    - Ensure Docker is running.
    - Check your version with `docker --version`.

3.  **Verify Kubernetes**
    - Ensure your local Kubernetes cluster is running.
    - Check your context with `kubectl config current-context`.
    - Check server version with `kubectl version`.

### 🤖 AI Checkpoints

1. **Environment Verification Prompt:**
   Ask your AI assistant: "What command should I run to verify all prerequisites for a local Kubernetes cluster?"

   **What to evaluate:** Does it suggest `docker version` and `kubectl cluster-info`? Does it mention checking that Docker is running and kubectl can connect to the cluster? Did it provide the actual commands or just describe them?

2. **Troubleshooting Guidance:**
   If you encounter issues, ask: "My kubectl cannot connect to the cluster. What are the most common causes and how do I diagnose them?"

   **What to evaluate:** Does it mention checking if the cluster is running (for example, `minikube status` or Docker Desktop K8s enabled)? Does it suggest checking your kubeconfig context with `kubectl config current-context`? Does it provide actionable debugging steps rather than just generic advice?

### 📚 Resources

- [Docker Desktop Installation](https://www.docker.com/products/docker-desktop/)
- [Install Tools | Kubernetes](https://kubernetes.io/docs/tasks/tools/)
