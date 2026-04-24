import type { User } from '../types';
import type * as api from '../lib/api';

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  paramType: 'none' | 'user' | 'text';
  placeholder?: string;
  execute: (ctx: CommandContext) => Promise<void>;
}

export interface RemoteCommand {
  name: string;
  description: string;
  usage: string;
  params: Array<{ name: string; type: string; required?: boolean; placeholder?: string }>;
  agentId: string;
  agentName: string;
}

export interface CommandContext {
  channelId: string;
  currentUserId: string;
  args: string;
  resolvedUser?: { id: string; username: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatch: (action: any) => void;
  api: typeof api;
  actions: { openDm: (userId: string) => Promise<void> };
}

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

export type ResolveResult =
  | { type: 'builtin'; cmd: CommandDefinition }
  | { type: 'remote'; cmd: RemoteCommand }
  | { type: 'ambiguous'; cmds: RemoteCommand[] }
  | null;

export interface CommandGroup {
  group: string;
  items: Array<CommandDefinition | RemoteCommand>;
}

class CommandRegistry {
  private builtins: Map<string, CommandDefinition> = new Map();
  private remoteCommands: RemoteCommand[] = [];
  private remoteByName: Map<string, RemoteCommand[]> = new Map();

  register(cmd: CommandDefinition): void {
    this.builtins.set(cmd.name, cmd);
  }

  get(name: string): CommandDefinition | undefined {
    return this.builtins.get(name);
  }

  all(): CommandDefinition[] {
    return [...this.builtins.values()];
  }

  setRemoteCommands(commands: RemoteCommand[]): void {
    this.remoteCommands = commands;
    this.remoteByName = new Map();
    for (const cmd of commands) {
      const existing = this.remoteByName.get(cmd.name);
      if (existing) {
        existing.push(cmd);
      } else {
        this.remoteByName.set(cmd.name, [cmd]);
      }
    }
  }

  resolve(name: string): ResolveResult {
    const builtin = this.builtins.get(name);
    if (builtin) return { type: 'builtin', cmd: builtin };

    const remotes = this.remoteByName.get(name);
    if (!remotes || remotes.length === 0) return null;
    if (remotes.length === 1) return { type: 'remote', cmd: remotes[0]! };
    return { type: 'ambiguous', cmds: remotes };
  }

  search(prefix: string): CommandGroup[] {
    const groups: CommandGroup[] = [];

    const matchingBuiltins = [...this.builtins.values()].filter(cmd => cmd.name.startsWith(prefix));
    if (matchingBuiltins.length > 0) {
      groups.push({ group: 'System', items: matchingBuiltins });
    }

    const agentGroups = new Map<string, RemoteCommand[]>();
    for (const cmd of this.remoteCommands) {
      if (!cmd.name.startsWith(prefix)) continue;
      const existing = agentGroups.get(cmd.agentName);
      if (existing) {
        existing.push(cmd);
      } else {
        agentGroups.set(cmd.agentName, [cmd]);
      }
    }
    for (const [agentName, items] of agentGroups) {
      groups.push({ group: agentName, items });
    }

    return groups;
  }
}

export const commandRegistry = new CommandRegistry();
