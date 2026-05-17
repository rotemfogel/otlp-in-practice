import { Router } from 'express';
import { v4 as uuid4 } from 'uuid';
import { SpanStatusCode } from '@opentelemetry/api';
import type { Request, Response } from 'express';
import type { QueueService } from '../services/queue';
import type { SSEManager } from '../services/sse';
import type {
  TranslateRequest,
  TranslateResponse,
  SessionResponse,
  TranslationJob,
  JobStatus,
  TranslationSession,
} from '../types';
import { SUPPORTED_LANGUAGES } from '../types';
import {
  translationRequestsCounter,
  jobsEnqueuedCounter,
  requestDuration,
  validationErrorsCounter,
} from '../metrics';
import { setSpanError, tracer } from '../tracers';
import { logger } from '../logger';

interface ValidationErrorBody {
  error: string;
  details?: string;
  supportedLanguages?: string[];
}

enum VALIDATION_ERROR_TYPES {
  EMPTY_STRING = 'empty_text',
  EMPTY_LANGUAGES = 'empty_languages',
  TOO_MANY_LANGUAGES = 'too_many_languages',
  INVALID_LANGUAGES = 'invalid_languages',
}

interface ValidationError {
  statusCode: number;
  body: ValidationErrorBody;
  errorType: VALIDATION_ERROR_TYPES;
  spanMessage: string;
}

function validateTranslationRequest(
  text: unknown,
  targetLanguages: unknown,
): ValidationError | null {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return {
      statusCode: 400,
      body: {
        error: 'Text is required',
        details: 'Text must be a non-empty string',
      },
      errorType: VALIDATION_ERROR_TYPES.EMPTY_STRING,
      spanMessage: 'Empty text',
    };
  }

  if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
    return {
      statusCode: 400,
      body: {
        error: 'At least one target language is required',
        details: 'targetLanguages must be a non-empty array',
      },
      errorType: VALIDATION_ERROR_TYPES.EMPTY_LANGUAGES,
      spanMessage: 'Empty languages',
    };
  }

  if (targetLanguages.length > 3) {
    return {
      statusCode: 400,
      body: {
        error: 'Maximum 3 target languages allowed',
        details: `You requested ${targetLanguages.length} languages`,
      },
      errorType: VALIDATION_ERROR_TYPES.TOO_MANY_LANGUAGES,
      spanMessage: 'Too many languages',
    };
  }

  // Validate each language
  const unsupportedLanguages = targetLanguages.filter(
    (lang) => !SUPPORTED_LANGUAGES.includes(lang as any),
  );

  if (unsupportedLanguages.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: `Unsupported language: ${unsupportedLanguages.join(', ')}`,
        details: `Supported languages: ${[...SUPPORTED_LANGUAGES].join(', ')}`,
        supportedLanguages: [...SUPPORTED_LANGUAGES],
      },
      errorType: VALIDATION_ERROR_TYPES.INVALID_LANGUAGES,
      spanMessage: 'Invalid languages',
    };
  }

  return null;
}

export interface TranslationRouterDeps {
  queueService: QueueService;
  sseManager: SSEManager;
}

export function createTranslationRouter(deps: TranslationRouterDeps): Router {
  const router = Router();
  const { queueService, sseManager } = deps;

  // POST /api/translate - Submit translation request
  router.post('/', async (req: Request, res: Response) => {
    await tracer.startActiveSpan(
      'create_translation_session',
      async (sessionSpan) => {
        try {
          const start = Date.now();
          const body = req.body as TranslateRequest;
          const { text, targetLanguages } = body;

          // Add business attributes
          sessionSpan.setAttribute('translation.text_length', text.length);
          sessionSpan.setAttribute(
            'translation.target_language_count',
            targetLanguages.length,
          );
          sessionSpan.setAttribute(
            'translation.target_languages',
            targetLanguages.join(','),
          );

          const isValid = await tracer.startActiveSpan(
            'validate_request',
            async (validationSpan) => {
              try {
                const validationError = validateTranslationRequest(
                  text,
                  targetLanguages,
                );

                if (validationError) {
                  validationErrorsCounter.add(1, {
                    error_type: validationError.errorType,
                  });
                  logger.warn('Validation failed', {
                    reason: validationError.errorType,
                    ip: req.ip,
                  });
                  setSpanError(
                    validationSpan,
                    new Error(validationError.spanMessage),
                  );
                  res
                    .status(validationError.statusCode)
                    .json(validationError.body);
                  return false;
                }

                validationSpan.setStatus({ code: SpanStatusCode.OK });
                return true;
              } finally {
                validationSpan.end();
              }
            },
          );

          if (!isValid) {
            return;
          }

          // Create session
          const sessionId = uuid4();
          sessionSpan.setAttribute('translation.session_id', sessionId);

          logger.info('Translation session created', {
            session_id: sessionId,
            text_length: text.length,
            target_languages: targetLanguages,
            language_count: targetLanguages.length,
          });

          const jobs = new Map<string, JobStatus>();
          const jobsList: TranslationJob[] = [];

          await tracer.startActiveSpan(
            'enqueue_translation_jobs',
            async (enqueueSpan) => {
              try {
                translationRequestsCounter.add(1, {
                  status: 'success',
                  language_count: targetLanguages.length.toString(),
                });
                enqueueSpan.setAttribute(
                  'translation.jobs_count',
                  targetLanguages.length,
                );

                for (const targetLanguage of targetLanguages) {
                  const jobId = uuid4();
                  const job: TranslationJob = {
                    jobId,
                    sessionId,
                    text,
                    sourceLanguage: 'en',
                    targetLanguage,
                    createdAt: new Date().toISOString(),
                  };

                  jobsList.push(job);
                  jobs.set(targetLanguage, { status: 'queued' });

                  // Enqueue job
                  await queueService.enqueueJob(job);
                  jobsEnqueuedCounter.add(1, {
                    target_language: targetLanguage,
                  });

                  logger.info('Translation job enqueued', {
                    job_id: jobId,
                    session_id: sessionId,
                    target_language: targetLanguage,
                    queue: 'translation_queue',
                  });
                }
                enqueueSpan.setStatus({ code: SpanStatusCode.OK });
              } catch (error) {
                setSpanError(enqueueSpan, error);
                throw error;
              } finally {
                enqueueSpan.end();
              }
            },
          );

          // Save session
          const session: TranslationSession = {
            sessionId,
            text: body.text,
            sourceLanguage: 'en',
            status: 'queued',
            jobs,
          };

          await queueService.saveSession(session);

          // Return response
          const response: TranslateResponse = {
            sessionId,
            status: 'queued',
            jobs: jobsList.map((job) => ({
              jobId: job.jobId,
              targetLanguage: job.targetLanguage,
              status: 'queued',
            })),
          };

          logger.info('Translation session ready', {
            session_id: sessionId,
            jobs_count: jobsList.length,
            status: 'queued',
          });
          requestDuration.record(Date.now() - start, {
            target_language_count: body.targetLanguages.length.toString(),
          });
          sessionSpan.setStatus({ code: SpanStatusCode.OK });
          res.status(201).json(response);
        } catch (error) {
          setSpanError(sessionSpan, error);
          logger.error('Error creating translation session', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          });
          res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
        } finally {
          sessionSpan.end();
        }
      },
    );
  });

  // GET /api/translate/:sessionId - Get session status
  router.get('/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params as unknown & { sessionId: string };

      const session = await queueService.getSession(sessionId);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Convert Map to object for JSON response
      const translations: Record<string, JobStatus> = {};
      for (const [lang, jobStatus] of session.jobs.entries()) {
        translations[lang] = jobStatus;
      }

      const response: SessionResponse = {
        sessionId: session.sessionId,
        text: session.text,
        status: session.status,
        translations,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /api/translate/:sessionId/events - SSE endpoint
  router.get('/:sessionId/events', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params as unknown & { sessionId: string };

      // Verify session exists
      const session = await queueService.getSession(sessionId);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Add SSE connection
      sseManager.addConnection(sessionId, res);

      logger.info('SSE connection established', {
        session_id: sessionId,
        ip: req.ip,
      });
    } catch (error) {
      logger.error('Error establishing SSE connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
