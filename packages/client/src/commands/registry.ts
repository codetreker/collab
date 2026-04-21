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

class CommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();

  register(cmd: CommandDefinition): void {
    this.commands.set(cmd.name, cmd);
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  search(prefix: string): CommandDefinition[] {
    return [...this.commands.values()].filter(cmd => cmd.name.startsWith(prefix));
  }

  all(): CommandDefinition[] {
    return [...this.commands.values()];
  }
}

export const commandRegistry = new CommandRegistry();
