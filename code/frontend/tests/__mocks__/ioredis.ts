// Mock ioredis for tests
import { jest } from '@jest/globals';

export class Redis {
  private commands: Record<string, any> = {};
  private subscriptions: Map<
    string,
    (channel: string, message: string) => void
  > = new Map();

  constructor(config?: any) {
    this.commands = {
      ping: (jest.fn() as any).mockResolvedValue('PONG'),
      lpush: (jest.fn() as any).mockResolvedValue(1),
      brpop: (jest.fn() as any).mockResolvedValue(null),
      hset: (jest.fn() as any).mockResolvedValue(1),
      hgetall: (jest.fn() as any).mockResolvedValue({}),
      hincrby: (jest.fn() as any).mockResolvedValue(1),
      expire: (jest.fn() as any).mockResolvedValue(1),
      subscribe: (jest.fn() as any).mockResolvedValue(undefined),
      publish: (jest.fn() as any).mockResolvedValue(1),
      quit: (jest.fn() as any).mockResolvedValue('OK'),
    };
  }

  ping = () => this.commands.ping();
  lpush = (...args: any[]) => this.commands.lpush(...args);
  brpop = (...args: any[]) => this.commands.brpop(...args);
  hset = (...args: any[]) => this.commands.hset(...args);
  hgetall = (...args: any[]) => this.commands.hgetall(...args);
  hincrby = (...args: any[]) => this.commands.hincrby(...args);
  expire = (...args: any[]) => this.commands.expire(...args);
  subscribe = (...args: any[]) => this.commands.subscribe(...args);
  publish = (...args: any[]) => this.commands.publish(...args);
  quit = () => this.commands.quit();

  on(event: string, handler: Function) {
    if (event === 'message') {
      this.subscriptions.set('message', handler as any);
    }
  }

  // Helper to trigger message event
  __triggerMessage(channel: string, message: string) {
    const handler = this.subscriptions.get('message');
    if (handler) {
      handler(channel, message);
    }
  }

  // Helper to get mock
  __getMock(command: string): any {
    return this.commands[command];
  }
}

export default Redis;
