# Lab: Deploying the Translation Application

### 🎯 Lab Goal

Deploy the web translation application alongside the observability stack and understand the architecture of a distributed system with Redis-based job queuing and Server-Sent Events (SSE) for real-time updates.

### 📝 Overview & Concepts

The translation application demonstrates real-world patterns found in production distributed systems:

- **Frontend Service**: Express.js/TypeScript server that handles HTTP requests, manages sessions, and streams real-time updates to clients via Server-Sent Events (SSE)
- **Worker Service**: Python background processor that consumes translation jobs from Redis and publishes results back
- **Redis**: Acts as the message broker (for job queuing with lists), pub/sub system (for result distribution), and session store (for tracking translation state)

This architecture separates concerns between request handling (frontend) and compute-heavy operations (worker), allowing horizontal scaling. The worker processes translations using Argos Translate, which can take a few seconds per job, making async processing essential for good user experience.

In this lab, you'll:

- Deploy the complete application stack using Docker Compose
- Understand service dependencies and networking
- Test the translation workflow end-to-end

### 📋 Tasks

1. **Review the Application Architecture**

   Before deploying, understand the component diagram:

   ```
   User Browser
        ↓ (HTTP/SSE)
   Frontend Service
        ↓ (Redis List: LPUSH jobs)
   Redis
        ↓ (Redis List: BRPOP jobs)
   Worker Service
        ↓ (Redis Pub/Sub: publish results)
   Redis
        ↓ (Redis Pub/Sub: subscribe results)
   Frontend Service
        ↓ (Server-Sent Events)
   User Browser
   ```

2. **Create Application Compose File**

   Navigate to `compose/` and create `compose.app.yaml`:

   ```yaml
   # Application Services
   # Translation app with frontend, worker, and Redis

   services:
     redis:
       image: redis:8-alpine
       container_name: redis
       ports:
         - '6379:6379'
       networks:
         - app
       healthcheck:
         test: ['CMD', 'redis-cli', 'ping']
         interval: 5s
         timeout: 3s
         retries: 5
       restart: unless-stopped

     frontend:
       image: lmacademy/web-translator-frontend:v1.1.0
       container_name: frontend
       ports:
         - '3001:3000'
       environment:
         - REDIS_HOST=redis
         - REDIS_PORT=6379
         - PORT=3000
         - LOG_LEVEL=info
         - SOURCE_LANGUAGE=en
       depends_on:
         redis:
           condition: service_healthy
       networks:
         - app
       restart: unless-stopped

     worker:
       image: lmacademy/web-translator-worker:v1.1.0
       container_name: worker
       environment:
         - REDIS_HOST=redis
         - REDIS_PORT=6379
         - LOG_LEVEL=info
         - SOURCE_LANGUAGE=en
       depends_on:
         redis:
           condition: service_healthy
       networks:
         - app
       restart: unless-stopped
   ```

3. **Update Main Compose File**

   Edit `compose/compose.yaml` to include the application:

   ```yaml
   # Main Docker Compose file for OpenTelemetry Course
   # This file includes the observability stack and application

   include:
     - compose.observability.yaml
     - compose.app.yaml

   # Shared networks for all services
   networks:
     observability:
       driver: bridge
       name: observability
     app:
       driver: bridge
       name: app
   ```

4. **Deploy the Complete Stack**

   From the `compose/` directory:

   ```bash
   docker compose up -d
   ```

   This will start all services from both `compose.observability.yaml` and `compose.app.yaml`.

5. **Verify All Services Are Running**

   Check that all containers are up:

   ```bash
   docker compose ps
   ```

   You should see:
   - **Observability**: prometheus, loki, tempo, grafana
   - **Application**: redis, frontend, worker

   All should show status "Up" or "running".

6. **Verify Network Configuration**

   Inspect both networks to confirm proper connectivity:

   ```bash
   # Check observability network
   docker network inspect observability

   # Check app network
   docker network inspect app
   ```

7. **Access the Translation Application**

   Open http://localhost:3001 in your browser. You should see the translation interface.

8. **Test the Translation Workflow**

   In the web UI:
   - Enter text in English (e.g., "Hello, how are you?")
   - Select one or more target languages (Spanish, French, German)
   - Click "Translate"
   - Watch the real-time updates as translations complete
   - Check the translation history panel on the right

   The workflow:
   1. Frontend creates a session and enqueues jobs to Redis
   2. Worker pulls jobs, translates text (2-5 seconds each)
   3. Worker publishes results to Redis pub/sub
   4. Frontend receives results and pushes to browser via SSE
   5. Browser updates UI in real-time

9. **Monitor Redis Activity**

   Connect to Redis and observe the data structures:

   ```bash
   # Access Redis CLI
   docker exec -it redis redis-cli

   # Check queue length (should be 0 after translations complete)
   LLEN translation:jobs

   # List all keys (sessions are stored as hashes)
   KEYS *

   # Inspect a session (replace SESSION_ID with actual ID from URL)
   HGETALL session:SESSION_ID

   # Check pub/sub channels
   PUBSUB CHANNELS

   # Exit Redis CLI
   exit
   ```

10. **Check Container Logs**

    View logs from each service to understand the flow:

    ```bash
    # Frontend logs (HTTP requests, SSE connections)
    docker compose logs frontend --tail=50

    # Worker logs (job processing, translation times)
    docker compose logs worker --tail=50

    # Redis logs
    docker compose logs redis --tail=50
    ```

### 🤖 AI Checkpoints

1. **Understanding Async Patterns:**

   Ask your AI assistant: "Explain why this application uses Redis lists for job queuing instead of making synchronous HTTP requests from frontend to worker. What are the benefits and trade-offs of this architecture?"

   **What to evaluate:** Does it mention decoupling and resilience? Does it explain that workers can scale independently? Does it discuss the trade-off of added complexity vs. reliability? Look at your running application - what happens if you submit 10 translation jobs at once? Would a synchronous design handle this well?

2. **Server-Sent Events (SSE):**

   Ask: "What is the difference between Server-Sent Events (SSE) and WebSockets? Why might SSE be a better choice for this translation application?"

   **What to evaluate:** Does it explain that SSE is unidirectional (server→client only)? Does it mention that SSE uses standard HTTP and is simpler than WebSockets? Does it note that SSE automatically reconnects? In your browser's DevTools (Network tab, filter by "events"), inspect the SSE connection - can you see the translation update events?

3. **Service Dependencies:**

   Ask: "In the Docker Compose file, the frontend and worker both have `depends_on: redis: condition: service_healthy`. What does this accomplish? What would happen without it?"

   **What to evaluate:** Does it explain that services wait for Redis to be ready before starting? Does it mention that `service_healthy` checks the healthcheck, not just container start? Try this: run `docker compose down` then `docker compose up -d` again. Watch the startup sequence with `docker compose logs --follow`. Do frontend and worker wait for Redis? Now ask the AI: "What happens if Redis crashes after the application starts?" - this reveals the limitation of depends_on.

### 📚 Resources

- [Redis Lists (for Job Queues)](https://redis.io/docs/latest/develop/data-types/lists/)
- [Redis Pub/Sub](https://redis.io/docs/latest/develop/interact/pubsub/)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Docker Compose depends_on](https://docs.docker.com/compose/compose-file/05-services/#depends_on)
