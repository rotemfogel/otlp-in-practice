import type { Response } from 'express';
import { logger } from '../logger';

export interface SSEConnection {
  res: Response;
  sessionId: string;
}

export class SSEManager {
  private connections: Map<string, Set<Response>>;

  constructor() {
    this.connections = new Map();
  }

  addConnection(sessionId: string, res: Response): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

    // Send initial comment to establish connection
    res.write(':ok\n\n');

    // Add to connections map
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(res);

    // Handle client disconnect
    res.on('close', () => {
      this.removeConnection(sessionId, res);
    });

    const connection_count = this.connections.get(sessionId)!.size;
    logger.info('SSE connection added', { session_id: sessionId, connection_count });
  }

  sendEvent(sessionId: string, event: string, data: unknown): void {
    const connections = this.connections.get(sessionId);

    if (!connections || connections.size === 0) {
      logger.warn('SSE event dropped: no active connections for session', {
        session_id: sessionId,
        event,
      });
      return;
    }

    const dataStr = JSON.stringify(data);
    const message = `event: ${event}\ndata: ${dataStr}\n\n`;

    // Send to all connections for this session
    for (const res of connections) {
      try {
        res.write(message);
      } catch (error) {
        logger.error('Error writing to SSE connection', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        this.removeConnection(sessionId, res);
      }
    }

    logger.info('SSE event sent', {
      session_id: sessionId,
      event,
      connection_count: connections.size,
    });
  }

  removeConnection(sessionId: string, res: Response): void {
    const connections = this.connections.get(sessionId);

    if (connections) {
      connections.delete(res);

      if (connections.size === 0) {
        this.connections.delete(sessionId);
      }

      logger.info('SSE connection removed', {
        session_id: sessionId,
        remaining_connections: connections.size,
      });
    }

    // Close the response if not already closed
    if (!res.writableEnded) {
      res.end();
    }
  }

  getConnectionCount(sessionId: string): number {
    return this.connections.get(sessionId)?.size || 0;
  }

  closeAllConnections(sessionId: string): void {
    const connections = this.connections.get(sessionId);

    if (connections) {
      const connection_count = connections.size;
      for (const res of connections) {
        if (!res.writableEnded) {
          res.end();
        }
      }
      this.connections.delete(sessionId);
      logger.info('Closed all SSE connections for session', {
        session_id: sessionId,
        connection_count,
      });
    }
  }

  closeAll(): void {
    for (const [sessionId, connections] of this.connections.entries()) {
      for (const res of connections) {
        if (!res.writableEnded) {
          res.end();
        }
      }
    }
    this.connections.clear();
    logger.info('Closed all SSE connections');
  }
}
