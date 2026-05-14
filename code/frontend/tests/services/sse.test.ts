import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SSEManager } from '../../src/services/sse.js';
import type { Response } from 'express';

describe('SSEManager', () => {
  let sseManager: SSEManager;

  beforeEach(() => {
    sseManager = new SSEManager();
  });

  it('should add a connection', () => {
    const mockRes = createMockResponse();

    sseManager.addConnection('session-1', mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream',
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(mockRes.write).toHaveBeenCalledWith(':ok\n\n');
    expect(sseManager.getConnectionCount('session-1')).toBe(1);
  });

  it('should send event to connections', () => {
    const mockRes1 = createMockResponse();
    const mockRes2 = createMockResponse();

    sseManager.addConnection('session-1', mockRes1);
    sseManager.addConnection('session-1', mockRes2);

    const eventData = { message: 'test' };
    sseManager.sendEvent('session-1', 'test_event', eventData);

    const expectedMessage = `event: test_event\ndata: ${JSON.stringify(eventData)}\n\n`;
    expect(mockRes1.write).toHaveBeenCalledWith(expectedMessage);
    expect(mockRes2.write).toHaveBeenCalledWith(expectedMessage);
  });

  it('should not send event to non-existent session', () => {
    const mockRes = createMockResponse();

    sseManager.addConnection('session-1', mockRes);
    sseManager.sendEvent('session-2', 'test_event', { data: 'test' });

    // Only initial :ok should be written
    expect(mockRes.write).toHaveBeenCalledTimes(1);
  });

  it('should remove connection', () => {
    const mockRes = createMockResponse();

    sseManager.addConnection('session-1', mockRes);
    expect(sseManager.getConnectionCount('session-1')).toBe(1);

    sseManager.removeConnection('session-1', mockRes);
    expect(sseManager.getConnectionCount('session-1')).toBe(0);
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should handle multiple connections per session', () => {
    const mockRes1 = createMockResponse();
    const mockRes2 = createMockResponse();

    sseManager.addConnection('session-1', mockRes1);
    sseManager.addConnection('session-1', mockRes2);

    expect(sseManager.getConnectionCount('session-1')).toBe(2);

    sseManager.removeConnection('session-1', mockRes1);
    expect(sseManager.getConnectionCount('session-1')).toBe(1);
  });

  it('should close all connections for a session', () => {
    const mockRes1 = createMockResponse();
    const mockRes2 = createMockResponse();

    sseManager.addConnection('session-1', mockRes1);
    sseManager.addConnection('session-1', mockRes2);

    sseManager.closeAllConnections('session-1');

    expect(mockRes1.end).toHaveBeenCalled();
    expect(mockRes2.end).toHaveBeenCalled();
    expect(sseManager.getConnectionCount('session-1')).toBe(0);
  });

  it('should close all connections', () => {
    const mockRes1 = createMockResponse();
    const mockRes2 = createMockResponse();
    const mockRes3 = createMockResponse();

    sseManager.addConnection('session-1', mockRes1);
    sseManager.addConnection('session-1', mockRes2);
    sseManager.addConnection('session-2', mockRes3);

    sseManager.closeAll();

    expect(mockRes1.end).toHaveBeenCalled();
    expect(mockRes2.end).toHaveBeenCalled();
    expect(mockRes3.end).toHaveBeenCalled();
    expect(sseManager.getConnectionCount('session-1')).toBe(0);
    expect(sseManager.getConnectionCount('session-2')).toBe(0);
  });

  it('should handle client disconnect', () => {
    const mockRes = createMockResponse();
    let closeHandler: any = null;

    mockRes.on = jest.fn((event: string, handler: any) => {
      if (event === 'close') {
        closeHandler = handler;
      }
      return mockRes;
    }) as any;

    sseManager.addConnection('session-1', mockRes);
    expect(sseManager.getConnectionCount('session-1')).toBe(1);

    // Simulate client disconnect
    if (closeHandler) {
      closeHandler();
    }

    expect(sseManager.getConnectionCount('session-1')).toBe(0);
  });
});

// Helper to create a mock Express Response
function createMockResponse(): Response {
  return {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn().mockReturnThis(),
    writableEnded: false,
  } as any;
}
