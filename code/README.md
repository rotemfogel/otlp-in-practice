# Translation Queue — OpenTelemetry Demo Application

An async translation service demonstrating distributed system patterns, designed for incremental OpenTelemetry instrumentation exercises.

## Architecture

**Components:**

- **Frontend**: Express.js TypeScript server serving UI and REST API
- **Worker**: Python service processing translation jobs
- **Redis**: Queue (lists), pub/sub (results), and session storage (hashes)

**Flow:**

1. User submits text + target languages → Frontend creates session
2. Frontend enqueues jobs to Redis list (`LPUSH`)
3. Worker pulls jobs (`BRPOP`), translates with [Argos Translate](https://github.com/argosopentech/argos-translate) (2-5s latency)
4. Worker publishes results to Redis Pub/Sub
5. Frontend streams updates to browser via Server-Sent Events (SSE)

## Quick Start

### Prerequisites

- Docker & Docker Compose

### Run

**Production:**

```bash
docker compose up --build
```

**Development (hot-reload):**

```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

Open <http://localhost:3001>

> First build takes ~2-3 minutes to download translation models (~300MB). Subsequent builds are fast.

See [DEVELOPMENT.md](DEVELOPMENT.md) for hot-reload details.

## Supported Languages

| Language | Code |
| -------- | ---- |
| Spanish  | `es` |
| French   | `fr` |
| German   | `de` |

Source language: English (`en`)

## API Reference

### `POST /api/translate`

Submit translation request.

**Request:**

```json
{
  "text": "Hello, how are you?",
  "targetLanguages": ["es", "fr"]
}
```

**Response (201):**

```json
{
  "sessionId": "uuid",
  "status": "queued",
  "jobs": [
    { "jobId": "uuid", "targetLanguage": "es", "status": "queued" },
    { "jobId": "uuid", "targetLanguage": "fr", "status": "queued" }
  ]
}
```

### `GET /api/translate/:sessionId/events`

SSE stream for translation progress.

**Events:**

- `translation_complete`: `{jobId, targetLanguage, translatedText, status: "completed"}`
- `translation_error`: `{jobId, targetLanguage, error, status: "error"}`
- `session_complete`: `{sessionId, status: "completed"}`

### `GET /api/translate/:sessionId`

Get session state.

**Response:**

```json
{
  "sessionId": "uuid",
  "text": "Hello, how are you?",
  "status": "in_progress",
  "translations": {
    "es": { "status": "completed", "translatedText": "Hola, ¿cómo estás?" },
    "fr": { "status": "processing" }
  }
}
```

## Technology Choices

| Choice                     | Rationale                                                       |
| -------------------------- | --------------------------------------------------------------- |
| **Raw Redis** (not BullMQ) | Cross-language, more instrumentation points, fewer dependencies |
| **Argos Translate**        | Offline/local, zero cost, realistic processing time             |
| **SSE** (not WebSockets)   | Simpler to instrument, native browser support                   |
| **Vanilla JS** (no React)  | Compact, no build step, focus on backend                        |
| **uv** (Python)            | Fast installs, reproducible builds with lock file               |

## Testing

**Frontend:**

```bash
cd frontend && npm test
```

**Worker:**

```bash
cd worker && pytest
```

## Environment Variables

| Variable     | Default     | Description        |
| ------------ | ----------- | ------------------ |
| `REDIS_HOST` | `localhost` | Redis server host  |
| `REDIS_PORT` | `6379`      | Redis server port  |
| `PORT`       | `3001`      | Frontend HTTP port |
| `LOG_LEVEL`  | `info`      | Log level          |
