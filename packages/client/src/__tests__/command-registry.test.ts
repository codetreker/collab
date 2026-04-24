import { describe, it, expect, beforeEach } from 'vitest';
import { commandRegistry } from '../commands/registry';
import type { CommandDefinition, RemoteCommand } from '../commands/registry';

const helpBuiltin: CommandDefinition = {
  name: 'help',
  description: 'Show help',
  usage: '/help',
  paramType: 'none',
  execute: async () => {},
};

function makeRemote(name: string, agentId: string, agentName: string): RemoteCommand {
  return {
    name,
    description: `${name} remote command`,
    usage: `/${name}`,
    params: [],
    agentId,
    agentName,
  };
}

// Register a builtin for testing (only once, since singleton persists)
commandRegistry.register(helpBuiltin);

describe('CommandRegistry', () => {
  beforeEach(() => {
    commandRegistry.setRemoteCommands([]);
  });

  describe('resolve', () => {
    it('builtin command → type: builtin', () => {
      const result = commandRegistry.resolve('help');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('builtin');
    });

    it('unique remote command → type: remote with agentId', () => {
      commandRegistry.setRemoteCommands([makeRemote('deploy', 'agent-1', 'Bot')]);
      const result = commandRegistry.resolve('deploy');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('remote');
      if (result!.type === 'remote') {
        expect(result!.cmd.agentId).toBe('agent-1');
      }
    });

    it('multiple agents same name → type: ambiguous with candidates', () => {
      commandRegistry.setRemoteCommands([
        makeRemote('deploy', 'agent-1', 'Bot1'),
        makeRemote('deploy', 'agent-2', 'Bot2'),
      ]);
      const result = commandRegistry.resolve('deploy');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('ambiguous');
      if (result!.type === 'ambiguous') {
        expect(result!.cmds).toHaveLength(2);
      }
    });

    it('unknown command → null', () => {
      expect(commandRegistry.resolve('zzz_nonexistent')).toBeNull();
    });

    it('builtin > remote priority', () => {
      commandRegistry.setRemoteCommands([makeRemote('help', 'agent-1', 'Bot')]);
      const result = commandRegistry.resolve('help');
      expect(result!.type).toBe('builtin');
    });
  });

  describe('search', () => {
    it('prefix filtering + correct grouping', () => {
      commandRegistry.setRemoteCommands([
        makeRemote('highlight', 'agent-1', 'Bot1'),
        makeRemote('deploy', 'agent-2', 'Bot2'),
      ]);

      const groups = commandRegistry.search('h');
      const systemGroup = groups.find((g) => g.group === 'System');
      expect(systemGroup).toBeDefined();
      expect(systemGroup!.items.some((i) => i.name === 'help')).toBe(true);

      const bot1Group = groups.find((g) => g.group === 'Bot1');
      expect(bot1Group).toBeDefined();
      expect(bot1Group!.items).toHaveLength(1);

      expect(groups.find((g) => g.group === 'Bot2')).toBeUndefined();
    });
  });

  describe('setRemoteCommands', () => {
    it('full replacement semantics', () => {
      commandRegistry.setRemoteCommands([makeRemote('deploy', 'agent-1', 'Bot')]);
      expect(commandRegistry.resolve('deploy')).not.toBeNull();

      commandRegistry.setRemoteCommands([makeRemote('analyze', 'agent-1', 'Bot')]);
      expect(commandRegistry.resolve('deploy')).toBeNull();
      expect(commandRegistry.resolve('analyze')).not.toBeNull();
    });
  });
});
