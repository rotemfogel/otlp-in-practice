import './instrumentation';
import express from 'express';
import { logger } from './logger';
import cors from 'cors';
import { join } from 'path';
import type { Server } from 'http';
import { QueueService } from './services/queue';
import { SSEManager } from './services/sse';
import { createTranslationRouter } from './routes/translation';
import type { TranslationResult } from './types';
import {
  propagation,
  context,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import { tracer, setSpanError } from './tracers';

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// Global state for graceful shutdown
let server: Server | null = null;
let queueService: QueueService | null = null;
let sseManager: SSEManager | null = null;

async function startServer(): Promise<void> {
  try {
    // Create Express app
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.static(join(__dirname, 'public')));

    // Initialize services
    logger.info('Initializing services');

    queueService = new QueueService({
      host: REDIS_HOST,
      port: REDIS_PORT,
    });

    await queueService.connect();

    sseManager = new SSEManager();

    // Subscribe to translation results
    await queueService.subscribeToResults(async (result: TranslationResult) => {
      const remoteCtx = propagation.extract(
        context.active(),
        result._traceContext ?? {},
      );

      logger.info('Translation result received', {
        job_id: result.jobId,
        session_id: result.sessionId,
        target_language: result.targetLanguage,
        status: result.status,
      });

      if (result.status === 'error') {
        logger.error('Translation job failed', {
          job_id: result.jobId,
          session_id: result.sessionId,
          target_language: result.targetLanguage,
          error: result.error,
        });
      }

      await tracer.startActiveSpan(
        'process_translation_result',
        {
          kind: SpanKind.CONSUMER,
          attributes: {
            'translation.job_id': result.jobId,
            'translation.session_id': result.sessionId,
            'translation.target_language': result.targetLanguage,
            'translation.status': result.status,
          },
        },
        remoteCtx,
        async (resultSpan) => {
          try {
            // Update session in Redis
            await queueService!.updateJobStatus(
              result.sessionId,
              result.targetLanguage,
              result.status === 'completed' ? 'completed' : 'error',
              result.translatedText,
              result.error,
            );

            // Send SSE event
            const eventType =
              result.status === 'completed'
                ? 'translation_complete'
                : 'translation_error';

            sseManager!.sendEvent(result.sessionId, eventType, result);

            // Check if session is complete
            const session = await queueService!.getSession(result.sessionId);
            if (session && session.status === 'completed') {
              sseManager!.sendEvent(result.sessionId, 'session_complete', {
                sessionId: result.sessionId,
                status: 'completed',
              });
              logger.info('Translation session completed', {
                session_id: result.sessionId,
                status: 'completed',
              });
            }

            resultSpan.setStatus({ code: SpanStatusCode.OK });
          } catch (error) {
            setSpanError(resultSpan, error);
            logger.error('Error processing translation result', {
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
            });
          } finally {
            resultSpan.end();
          }
        },
      );
    });

    // Mount routes
    const translationRouter = createTranslationRouter({
      queueService,
      sseManager,
    });
    app.use('/api/translate', translationRouter);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Start server
    server = app.listen(PORT, () => {
      logger.info('Frontend server started', { port: PORT });
      logger.info('Health check available', {
        url: `http://localhost:${PORT}/health`,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info('Received shutdown signal', { signal });

  try {
    // Close SSE connections
    if (sseManager) {
      sseManager.closeAll();
    }

    // Close HTTP server
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info('HTTP server closed');
    }

    // Disconnect from Redis
    if (queueService) {
      await queueService.disconnect();
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  gracefulShutdown('unhandledRejection');
});

// Start the server
startServer().catch((error) => {
  logger.error('Fatal error starting server', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
