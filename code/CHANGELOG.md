# Changelog

All notable changes to the Translation Queue application for OpenTelemetry instrumentation labs.

## [1.1.0] - 2026-02-27

### Description

Baseline application without OpenTelemetry instrumentation. This is the starting point for the OpenTelemetry course labs.

### Features

- ✅ Express.js TypeScript frontend with REST API
- ✅ Python worker with Argos Translate
- ✅ Redis-based job queue and pub/sub
- ✅ Server-Sent Events (SSE) for real-time updates
- ✅ Translation session management
- ✅ Support for Spanish, French, and German translations

### Architecture

- Async job processing with Redis lists (LPUSH/BRPOP)
- Pub/Sub for result distribution
- Session storage using Redis hashes
- Worker processes translations with realistic latency (2-5s)

### Lab Reference

**Start with this version for:** Lab 1.1 - Deploying the Translation Application

### What's Next

The next version (v1.2.0) will add OpenTelemetry SDK dependencies and basic instrumentation setup.

---

## Version History

- **v1.1.0** - Baseline application (current)
- **v1.2.0** - OpenTelemetry SDK setup (planned)
- **v1.3.0** - Metrics instrumentation (planned)
- **v1.4.0** - Traces instrumentation (planned)
- **v1.5.0** - Logs instrumentation (planned)
