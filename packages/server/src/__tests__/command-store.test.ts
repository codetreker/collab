import { describe, it, expect, beforeEach } from 'vitest';

// commandStore is a singleton, so we import and reset between tests
import { commandStore } from '../command-store.js';

const BUILTIN_NAMES = new Set(['help', 'leave', 'topic', 'invite', 'dm', 'status', 'clear', 'nick']);

function makeCmd(name: string, desc = `${name} command`) {
  return { name, description: desc, usage: `/${name}`, params: [] };
}

describe('CommandStore', () => {
  beforeEach(() => {
    // Clear all by unregistering known connections
    for (const g of commandStore.getAll()) {
      // We can't easily clear the singleton; instead register empty for known connections.
    }
    // Brute-force clear: unregister connections we've used
    for (const connId of ['conn-a', 'conn-b', 'conn-c', 'conn-x', 'conn-y', 'conn-z', 'conn-1', 'conn-2']) {
      commandStore.unregisterByConnection(connId);
    }
  });

  it('register → query returns registered commands', () => {
    const result = commandStore.register('agent-1', 'conn-a', [makeCmd('deploy'), makeCmd('rollback')], BUILTIN_NAMES);
    expect(result.registered).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);

    const all = commandStore.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.agentId).toBe('agent-1');
    expect(all[0]!.commands).toHaveLength(2);
  });

  it('register > 100 commands → throws error', () => {
    const cmds = Array.from({ length: 101 }, (_, i) => makeCmd(`cmd${i}`));
    expect(() => commandStore.register('agent-1', 'conn-a', cmds, BUILTIN_NAMES)).toThrow('Too many commands');
  });

  it('builtin name collision → returns skipped', () => {
    const result = commandStore.register('agent-1', 'conn-a', [makeCmd('help'), makeCmd('deploy')], BUILTIN_NAMES);
    expect(result.registered).toHaveLength(1);
    expect(result.registered[0]!.name).toBe('deploy');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.name).toBe('help');
  });

  it('unregisterByConnection → only clears that connection', () => {
    commandStore.register('agent-1', 'conn-a', [makeCmd('deploy')], BUILTIN_NAMES);
    commandStore.register('agent-2', 'conn-b', [makeCmd('analyze')], BUILTIN_NAMES);

    commandStore.unregisterByConnection('conn-a');

    const all = commandStore.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.agentId).toBe('agent-2');
  });

  it('getAll → groups by agentId', () => {
    commandStore.register('agent-1', 'conn-a', [makeCmd('deploy')], BUILTIN_NAMES);
    commandStore.register('agent-2', 'conn-b', [makeCmd('analyze')], BUILTIN_NAMES);

    const all = commandStore.getAll();
    expect(all).toHaveLength(2);
    const ids = all.map((g) => g.agentId).sort();
    expect(ids).toEqual(['agent-1', 'agent-2']);
  });

  it('getByName → returns all matching across agents', () => {
    commandStore.register('agent-1', 'conn-a', [makeCmd('deploy')], BUILTIN_NAMES);
    commandStore.register('agent-2', 'conn-b', [makeCmd('deploy')], BUILTIN_NAMES);

    const matches = commandStore.getByName('deploy');
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.agentId).sort()).toEqual(['agent-1', 'agent-2']);
  });

  it('getByName → returns empty for unknown', () => {
    expect(commandStore.getByName('nonexistent')).toEqual([]);
  });

  it('snapshot semantics: same connection registers twice → latter replaces former', () => {
    commandStore.register('agent-1', 'conn-a', [makeCmd('deploy'), makeCmd('rollback')], BUILTIN_NAMES);
    commandStore.register('agent-1', 'conn-a', [makeCmd('restart')], BUILTIN_NAMES);

    const all = commandStore.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.commands).toHaveLength(1);
    expect(all[0]!.commands[0]!.name).toBe('restart');
  });

  it('rebuildIndexes consistency: byName reflects current state after mutations', () => {
    commandStore.register('agent-1', 'conn-a', [makeCmd('deploy')], BUILTIN_NAMES);
    commandStore.register('agent-2', 'conn-b', [makeCmd('deploy')], BUILTIN_NAMES);

    expect(commandStore.getByName('deploy')).toHaveLength(2);

    commandStore.unregisterByConnection('conn-a');
    expect(commandStore.getByName('deploy')).toHaveLength(1);
    expect(commandStore.getByName('deploy')[0]!.agentId).toBe('agent-2');
  });
});
