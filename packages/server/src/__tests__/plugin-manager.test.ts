import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

function createMockWs(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as import('ws').WebSocket;
}

let pluginManager: typeof import('../plugin-manager.js')['pluginManager'];

describe('PluginManager', () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../plugin-manager.js');
    pluginManager = mod.pluginManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register / unregister / getConnection', () => {
    it('registers a new connection', () => {
      const ws = createMockWs();
      pluginManager.register('agent-1', ws, 'user-1');
      const conn = pluginManager.getConnection('agent-1');
      expect(conn).toBeDefined();
      expect(conn!.agentId).toBe('agent-1');
      expect(conn!.userId).toBe('user-1');
      expect(conn!.alive).toBe(true);
      expect(pluginManager.getConnectionCount()).toBe(1);
    });

    it('closes old connection when re-registering same agentId', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      pluginManager.register('agent-1', ws1, 'user-1');
      pluginManager.register('agent-1', ws2, 'user-1');
      expect(ws1.close).toHaveBeenCalledWith(1000, 'Replaced by new connection');
      expect(pluginManager.getConnection('agent-1')!.ws).toBe(ws2);
    });

    it('unregister removes connection', () => {
      const ws = createMockWs();
      pluginManager.register('agent-1', ws, 'user-1');
      pluginManager.unregister('agent-1');
      expect(pluginManager.getConnection('agent-1')).toBeUndefined();
      expect(pluginManager.getConnectionCount()).toBe(0);
    });

    it('unregister is a no-op for unknown agentId', () => {
      pluginManager.unregister('nonexistent');
      expect(pluginManager.getConnectionCount()).toBe(0);
    });

    it('getConnectedAgentIds returns all registered ids', () => {
      pluginManager.register('a', createMockWs(), 'u1');
      pluginManager.register('b', createMockWs(), 'u2');
      expect(pluginManager.getConnectedAgentIds().sort()).toEqual(['a', 'b']);
    });
  });

  describe('pushEvent', () => {
    it('sends event to a specific agent', () => {
      const ws = createMockWs();
      pluginManager.register('agent-1', ws, 'user-1');
      pluginManager.pushEvent('agent-1', 'message.new', { text: 'hi' });
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'event', event: 'message.new', data: { text: 'hi' } }),
      );
    });

    it('does nothing for unknown agent', () => {
      pluginManager.pushEvent('nope', 'ev', {});
    });

    it('does nothing when ws is not open', () => {
      const ws = createMockWs(3);
      pluginManager.register('agent-1', ws, 'user-1');
      pluginManager.pushEvent('agent-1', 'ev', {});
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastEvent', () => {
    it('sends event to all connected agents', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      pluginManager.register('a', ws1, 'u1');
      pluginManager.register('b', ws2, 'u2');
      pluginManager.broadcastEvent('update', { v: 1 });
      const expected = JSON.stringify({ type: 'event', event: 'update', data: { v: 1 } });
      expect(ws1.send).toHaveBeenCalledWith(expected);
      expect(ws2.send).toHaveBeenCalledWith(expected);
    });

    it('skips agents with closed sockets', () => {
      const ws1 = createMockWs(1);
      const ws2 = createMockWs(3);
      pluginManager.register('a', ws1, 'u1');
      pluginManager.register('b', ws2, 'u2');
      pluginManager.broadcastEvent('ev', {});
      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).not.toHaveBeenCalled();
    });
  });

  describe('request / resolveResponse', () => {
    it('sends a request and resolves when response arrives', async () => {
      const ws = createMockWs();
      ws.send = vi.fn().mockImplementation((raw: string) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'request') {
          pluginManager.resolveResponse(msg.id, { answer: 42 });
        }
      });
      pluginManager.register('agent-1', ws, 'user-1');
      const result = await pluginManager.request('agent-1', { q: 'hello' });
      expect(result).toEqual({ answer: 42 });
    });

    it('rejects when agent is not connected', async () => {
      await expect(pluginManager.request('nope', {})).rejects.toThrow('not connected');
    });

    it('rejects when response has error', async () => {
      const ws = createMockWs();
      ws.send = vi.fn().mockImplementation((raw: string) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'request') {
          pluginManager.resolveResponse(msg.id, undefined, 'fail');
        }
      });
      pluginManager.register('agent-1', ws, 'user-1');
      await expect(pluginManager.request('agent-1', {})).rejects.toThrow('fail');
    });

    it('times out if no response', async () => {
      const ws = createMockWs();
      pluginManager.register('agent-1', ws, 'user-1');
      await expect(pluginManager.request('agent-1', {}, 50)).rejects.toThrow('timed out');
    });

    it('unregister rejects pending requests', async () => {
      const ws = createMockWs();
      pluginManager.register('agent-1', ws, 'user-1');
      const p = pluginManager.request('agent-1', {}, 5000);
      pluginManager.unregister('agent-1');
      await expect(p).rejects.toThrow('disconnected');
    });

    it('resolveResponse is a no-op for unknown id', () => {
      pluginManager.resolveResponse('unknown-id', {});
    });
  });
});
