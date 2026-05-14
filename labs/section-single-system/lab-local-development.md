# Lab: Local Development Setup

### 🎯 Lab Goal

Configure a local development environment with hot-reloading for both frontend and worker services. This setup allows you to iterate quickly on OpenTelemetry instrumentation without rebuilding Docker images after every code change.

### 📝 Overview & Concepts

When developing and testing OpenTelemetry instrumentation, rebuilding Docker images for every small code change is time-consuming. A proper development setup provides:

- **Hot-reload**: Automatically restart services when code changes are detected
- **Volume mounts**: Share your local source code with containers
- **Debug logging**: More verbose output to understand instrumentation behavior
- **Fast iteration**: See changes in seconds, not minutes

**Current Setup:**

The project currently has:

- `compose/compose.yaml` - Main entry point
- `compose/compose.app.yaml` - Application services with pre-built images
- `compose/compose.observability.yaml` - Observability backends (Prometheus, Tempo, Loki, Grafana)

**What You'll Build:**

In this lab, you'll create two additional compose files for different environments:

- `compose/compose.dev.yaml` - Development environment with hot-reload
- `compose/compose.prod.yaml` - Production environment with registry images

This allows you to select environments with the `-f` flag:

- Development: `docker compose -f compose.dev.yaml up`
- Production: `docker compose -f compose.prod.yaml up`

### 📋 Tasks

1. **Review Current Compose Structure**

   Navigate to the `compose/` directory and examine the existing files:
   - compose.yaml (main entry point with includes)
   - compose.app.yaml (base application services)
   - compose.observability.yaml (prometheus, loki, tempo, grafana)

   Open `compose.yaml` and note the structure:

   ```yaml
   include:
     - compose.observability.yaml
     - compose.app.yaml

   networks:
     observability:
       driver: bridge
       name: observability
     app:
       driver: bridge
       name: app
   ```

   Open `compose.app.yaml` and see that services have pre-built image tags:

   ```yaml
   services:
     frontend:
       image: lmacademy/web-translator-frontend:v1.1.0
       # ... other config
   ```

   The application source code is located in `code/` with:
   - `frontend/` - Node.js/Express frontend
   - `worker/` - Python worker

2. **Delete the `image` configuration from compose.app.yaml**:

   Delete the `image: lmacademy/web-translator-<frontend|worker>:v1.1.0` from both `frontend` and `worker` services. This field will now be set from within the `compose.prod.yaml`. For `compose.dev.yaml`, we will use the `build` context instead of an image tag.

3. **Create Development Compose File**

   Create `compose/compose.dev.yaml`:

   ```yaml
   # Development Environment
   # Usage: docker compose -f compose.dev.yaml up

   include:
     - compose.observability.yaml
     - compose.app.yaml

   services:
     frontend:
       build:
         context: ../code/frontend
         dockerfile: Dockerfile.dev
         target: development
       volumes:
         # Mount source code for hot reload
         - ../code/frontend/src:/app/src:ro
         - ../code/frontend/tsconfig.json:/app/tsconfig.json:ro
       environment:
         - NODE_ENV=development
         - LOG_LEVEL=debug
       command: npm run dev

     worker:
       build:
         context: ../code/worker
         dockerfile: Dockerfile.dev
       volumes:
         # Mount source code for hot reload
         - ../code/worker/src:/app/src:ro
         # Preserve translation models (large, slow to download)
         - worker-models:/root/.local/share/argos-translate
       environment:
         - PYTHONUNBUFFERED=1
         - LOG_LEVEL=debug
       command: watchmedo auto-restart --directory=./src --pattern="*.py" --recursive -- python -m src.main

   volumes:
     worker-models:

   networks:
     observability:
       driver: bridge
       name: observability
     app:
       driver: bridge
       name: app
   ```

   **Key Points:**
   - Includes base configs (observability + app services)
   - Overrides `frontend` and `worker` with `build` configuration
   - Mounts source code for hot-reload
   - Defines networks

4. **Create Production Compose File**

   Create `compose/compose.prod.yaml` with production image tags:

   ```yaml
   # Production Environment
   # Usage: docker compose -f compose.prod.yaml up

   include:
     - compose.observability.yaml
     - compose.app.yaml

   services:
     frontend:
       image: lmacademy/web-translator-frontend:v1.1.0

     worker:
       image: lmacademy/web-translator-worker:v1.1.0

   networks:
     observability:
       driver: bridge
       name: observability
     app:
       driver: bridge
       name: app
   ```

   **Key Points:**
   - Includes base configs (observability + app services)
   - Adds explicit `image` tags to pull from registry
   - Defines networks (same as dev)

5. **Start Development Environment**

   ```bash
   # From the compose/ directory
   docker compose -f compose.dev.yaml up --build
   ```

   The `-f compose.dev.yaml` flag specifies which compose file to use.
   The `--build` flag ensures development Dockerfiles are built.

6. **Test Hot-Reload**

   **Frontend Test:**

   Make a change to `code/frontend/src/index.ts`. You should see tsx detecting the change and restarting the frontend service.

   **Worker Test:**

   Make a change to `code/worker/src/main.py`. You should see watchmedo detecting the change and restarting the Python worker.

7. **Switch to Production Mode**

   To use pre-built images:

   ```bash
   # Stop development environment
   docker compose -f compose.dev.yaml down

   # Start production environment (pulls images from registry)
   docker compose -f compose.prod.yaml up -d
   ```

### 🤖 AI Checkpoints

1. **Understanding Docker Compose Files:**

   Ask your AI assistant: "Explain how Docker Compose include files work. When compose.dev.yaml includes compose.app.yaml and then defines additional fields for the same service, how does the merging work?"

   **What to evaluate:** Does it explain that included files are merged in order? Does it mention that only specified fields are overridden, not entire services? Does it describe the merge behavior for volumes, environment variables, etc.?

2. **Volume Mount Strategy:**

   Ask: "In the compose.dev.yaml file, why do we mount source code as read-only (`:ro`)? What's the advantage of this approach?"

   **What to evaluate:** Does it explain that `:ro` prevents accidental changes to host files from inside the container? Does it mention that dependencies (node_modules) are installed during image build and don't need mounting? Try removing `:ro` and modifying a file from inside the container - does it persist on your host?

3. **Hot-Reload Trade-offs:**

   Ask: "What are the performance and debugging implications of using hot-reload in development vs. pre-built images in production?"

   **What to evaluate:** Does it mention startup time differences? Does it discuss that development mode might behave slightly differently? Does it explain why we use different base images (alpine vs. full images)? Check your Docker disk usage - how much bigger is the development setup?

### 📚 Resources

- [Docker Compose Override Files](https://docs.docker.com/compose/multiple-compose-files/merge/)
- [tsx - TypeScript Execute](https://tsx.is/)
- [Python watchdog Documentation](https://pythonhosted.org/watchdog/)
