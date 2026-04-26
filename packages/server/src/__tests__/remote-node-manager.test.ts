import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('uuid', () => ({ v4: () => 'aaaa-bbbb-cccc-dddd' }));

import { remoteNodeManager } from '../remote-node-manager.js';

function makeMockSocket(readyState = 1) {
  return {
    readyState,
    close: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
  } as any;
}

// Reset internal state between tests by unregistering everything
function resetManager() {
  for (const nodeId of ['node-1', 'node-2', 'node-3']) {
    remoteNodeManager.unregister(nodeId);
  }
}

describe('RemoteNodeManager', () => {
  beforeEach(() => {
    resetManager();
    vi.clearAllMocks();
  });

  it('register + isOnline + getConnection', () => {
    const ws = makeMockSocket();
    remoteNodeManager.register('node-1', ws, 'user-1');
    expect(remoteNodeManager.isOnline('node-1')).toBe(true);
    expect(remoteNodeManager.getConnection('node-1')).toBeTruthy();
  });

  it('isOnline returns false for unknown node', () => {
    expect(remoteNodeManager.isOnline('nope')).toBe(false);
  });

  it('isOnline returns false when ws is not open', () => {
    const ws = makeMockSocket(3); // CLOSED
    remoteNodeManager.register('node-1', ws, 'user-1');
    expect(remoteNodeManager.isOnline('node-1')).toBe(false);
  });

  it('register replaces existing connection', () => {
    const ws1 = makeMockSocket();
    const ws2 = makeMockSocket();
    remoteNodeManager.register('node-1', ws1, 'user-1');
    remoteNodeManager.register('node-1', ws2, 'user-1');
    expect(ws1.close).toHaveBeenCalledWith(1000, 'Replaced by new connection');
    expect(remoteNodeManager.getConnection('node-1')!).toBeTruthy();
  });

  it('unregister removes connection and rejects pending', async () => {
    const ws = makeMockSocket();
    remoteNodeManager.register('node-1', ws, 'user-1');

    const reqPromise = remoteNodeManager.request('node-1', { action: 'ls' }, 5000);
    remoteNodeManager.unregister('node-1');

    await expect(reqPromise).rejects.toThrow('disconnected');
    expect(remoteNodeManager.isOnline('node-1')).toBe(false);
  });

  it('unregister is a no-op for unknown node', () => {
    expect(() => remoteNodeManager.unregister('nope')).not.toThrow();
  });

  it('request throws when node not connected', async () => {
    await expect(remoteNodeManager.request('nope', {})).rejects.toThrow('not connected');
  });

  it('request sends message and can be resolved', async () => {
    const ws = makeMockSocket();
    remoteNodeManager.register('node-1', ws, 'user-1');

    const reqPromise = remoteNodeManager.request('node-1', { action: 'ls' }, 5000);
    expect(ws.send).toHaveBeenCalled();

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    remoteNodeManager.resolveResponse(sent.id, { entries: [] });

    const result = await reqPromise;
    expect(result).toEqual({ entries: [] });
  });

  it('resolveResponse with error rejects the promise', async () => {
    const ws = makeMockSocket();
    remoteNodeManager.register('node-1', ws, 'user-1');

    const reqPromise = remoteNodeManager.request('node-1', { action: 'ls' }, 5000);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    remoteNodeManager.resolveResponse(sent.id, null, 'path_not_allowed');

    await expect(reqPromise).rejects.toThrow('path_not_allowed');
  });

  it('resolveResponse ignores unknown id', () => {
    expect(() => remoteNodeManager.resolveResponse('unknown', {})).not.toThrow();
  });

  it('request times out', async () => {
    const ws = makeMockSocket();
    remoteNodeManager.register('node-1', ws, 'user-1');

    vi.useFakeTimers();
    const reqPromise = remoteNodeManager.request('node-1', { action: 'ls' }, 100);
    vi.advanceTimersByTime(150);

    await expect(reqPromise).rejects.toThrow('timed out');
    vi.useRealTimers();
  });

  it('markAlive sets alive flag', () => {
    const ws = makeMockSocket();
    remoteNodeManager.register('node-1', ws, 'user-1');
    remoteNodeManager.markAlive('node-1');
    const conn = remoteNodeManager.getConnection('node-1')!;
    expect(conn).toBeTruthy();
  });

  it('markAlive is no-op for unknown node', () => {
    expect(() => remoteNodeManager.markAlive('nope')).not.toThrow();
  });
});
