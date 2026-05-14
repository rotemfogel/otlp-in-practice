# Development Mode Guide

## Quick Start

**Development mode with hot-reload:**

```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

**Production mode:**

```bash
docker compose up --build
```

## Hot-Reload Behavior

### Frontend (TypeScript/Express)

- **Tool**: `tsx watch`
- **Watches**: `src/**/*.ts`
- **Reload time**: ~500ms
- **Volume**: `./frontend/src` → `/app/src` (read-only)
- **Preserves**: `node_modules` in named volume

### Worker (Python)

- **Tool**: `watchdog`
- **Watches**: `src/**/*.py`
- **Reload time**: ~1-2s (models stay cached)
- **Volume**: `./worker/src` → `/app/src` (read-only)
- **Preserves**: Translation models (~300MB) in volume
- **Latency**: 2-5s random delay per translation

## What Persists vs Resets

### Persists Across Restarts

✅ Redis data (sessions, queue, pub/sub)  
✅ Translation models (~300MB)  
✅ Historical metrics in Prometheus  
✅ Traces in Tempo  
✅ Logs in Loki

### Resets on Reload

⚠️ Counter metrics (process restarted)  
⚠️ In-flight HTTP requests  
⚠️ In-memory application state

## Observability Testing

Hot-reload is ideal for testing instrumentation:

- **Instrumentation changes**: Edit spans/attributes → instant feedback
- **Trace context**: Verify context persists through restarts
- **Connection spans**: See reconnection to Redis
- **Error handling**: Break, fix, trace immediately
- **Latency patterns**: 2-5s delays simulate real async processing

## Troubleshooting

**Frontend not reloading?**

- Check file is in `src/` (only this directory is mounted)
- Verify: `docker compose logs frontend`

**Worker not reloading?**

- Check `.py` file in `src/`
- Verify: `docker compose logs worker`
- Expect 1-2s restart delay (model loading)

**Models re-downloading?**

- Models cached in `worker-models` volume
- Check: `docker volume ls | grep worker-models`

## Performance

**Initial build:** ~2-3 minutes (downloads translation models)  
**Subsequent starts:** ~10 seconds  
**Reload after change:** < 1s (frontend), ~1-2s (worker)

## Best Practices

✅ Edit code on host, let Docker sync  
✅ Use dev mode for instrumentation work  
✅ Test restart scenarios (production-like)  
✅ Use production mode for final testing

❌ Don't edit inside containers (changes lost)  
❌ Don't mount `node_modules` from host (conflicts)  
❌ Don't expect in-memory state to survive  
❌ Don't use dev mode in production (not optimized)
