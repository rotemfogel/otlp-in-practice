import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createTranslationRouter } from '../../src/routes/translation.js';
import type { QueueService } from '../../src/services/queue.js';
import type { SSEManager } from '../../src/services/sse.js';
import type { TranslationSession } from '../../src/types.js';

describe('Translation Routes', () => {
  let app: express.Application;
  let mockQueueService: jest.Mocked<QueueService>;
  let mockSSEManager: jest.Mocked<SSEManager>;

  beforeEach(() => {
    // Create mocks
    mockQueueService = {
      connect: jest.fn(),
      enqueueJob: jest.fn(),
      subscribeToResults: jest.fn(),
      saveSession: jest.fn(),
      getSession: jest.fn(),
      updateJobStatus: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    mockSSEManager = {
      addConnection: jest.fn(),
      sendEvent: jest.fn(),
      removeConnection: jest.fn(),
      getConnectionCount: jest.fn(),
      closeAllConnections: jest.fn(),
      closeAll: jest.fn(),
    } as any;

    // Create app
    app = express();
    app.use(express.json());
    app.use(
      '/api/translate',
      createTranslationRouter({
        queueService: mockQueueService,
        sseManager: mockSSEManager,
      }),
    );
  });

  afterEach(() => {
    // Close any open SSE connections to prevent Jest from hanging
    if (mockSSEManager.closeAll) {
      mockSSEManager.closeAll();
    }
  });

  describe('POST /api/translate', () => {
    it('should create translation session with valid input', async () => {
      const response = await request(app)
        .post('/api/translate')
        .send({
          text: 'Hello, world!',
          targetLanguages: ['es', 'fr'],
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('status', 'queued');
      expect(response.body.jobs).toHaveLength(2);
      expect(mockQueueService.enqueueJob).toHaveBeenCalledTimes(2);
      expect(mockQueueService.saveSession).toHaveBeenCalledTimes(1);
    });

    it('should reject empty text', async () => {
      const response = await request(app)
        .post('/api/translate')
        .send({
          text: '',
          targetLanguages: ['es'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    it('should reject empty target languages', async () => {
      const response = await request(app).post('/api/translate').send({
        text: 'Hello',
        targetLanguages: [],
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('At least one');
    });

    it('should reject too many languages', async () => {
      const response = await request(app)
        .post('/api/translate')
        .send({
          text: 'Hello',
          targetLanguages: ['es', 'fr', 'de', 'ja'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Maximum 3');
    });

    it('should reject unsupported language', async () => {
      const response = await request(app)
        .post('/api/translate')
        .send({
          text: 'Hello',
          targetLanguages: ['es', 'xx'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Unsupported');
      expect(response.body).toHaveProperty('supportedLanguages');
    });
  });

  describe('GET /api/translate/:sessionId', () => {
    it('should return session status', async () => {
      const mockSession: TranslationSession = {
        sessionId: 'session-123',
        text: 'Hello',
        sourceLanguage: 'en',
        status: 'in_progress',
        jobs: new Map([
          ['es', { status: 'completed', translatedText: 'Hola' }],
          ['fr', { status: 'processing' }],
        ]),
      };

      mockQueueService.getSession.mockResolvedValue(mockSession);

      const response = await request(app).get('/api/translate/session-123');

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe('session-123');
      expect(response.body.translations).toHaveProperty('es');
      expect(response.body.translations.es.status).toBe('completed');
    });

    it('should return 404 for non-existent session', async () => {
      mockQueueService.getSession.mockResolvedValue(null);

      const response = await request(app).get('/api/translate/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /api/translate/:sessionId/events', () => {
    it('should establish SSE connection for existing session', async () => {
      const mockSession: TranslationSession = {
        sessionId: 'session-123',
        text: 'Hello',
        sourceLanguage: 'en',
        status: 'queued',
        jobs: new Map([['es', { status: 'queued' }]]),
      };

      mockQueueService.getSession.mockResolvedValue(mockSession);

      // Create a promise to capture when the connection is added
      const connectionPromise = new Promise<void>((resolve) => {
        const originalAddConnection = mockSSEManager.addConnection;
        mockSSEManager.addConnection = jest.fn((...args) => {
          originalAddConnection.call(mockSSEManager, ...args);
          // Close the response immediately to prevent hanging
          const res = args[1];
          if (res && !res.writableEnded) {
            res.end();
          }
          resolve();
        });
      });

      // Start the request (don't await - SSE stays open)
      request(app)
        .get('/api/translate/session-123/events')
        .set('Accept', 'text/event-stream')
        .end(() => {});

      // Wait for connection to be added
      await connectionPromise;

      // Verify the connection was added
      expect(mockSSEManager.addConnection).toHaveBeenCalledWith(
        'session-123',
        expect.anything(),
      );
    });

    it('should return 404 for non-existent session', async () => {
      mockQueueService.getSession.mockResolvedValue(null);

      const response = await request(app).get(
        '/api/translate/non-existent/events',
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });
});
