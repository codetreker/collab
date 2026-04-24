import type { AgentCommand } from './types.js';

// ─── Types ─────────────────────────────────────────────

interface StoredCommand extends AgentCommand {
  agentId: string;
  connectionId: string;
}

interface GroupedCommands {
  agentId: string;
  commands: AgentCommand[];
}

interface RegisterResult {
  registered: AgentCommand[];
  skipped: AgentCommand[];
}

// ─── CommandStore ──────────────────────────────────────

class CommandStore {
  private commands: StoredCommand[] = [];
  private byConnection: Map<string, StoredCommand[]> = new Map();
  private byName: Map<string, StoredCommand[]> = new Map();

  register(
    agentId: string,
    connectionId: string,
    commands: AgentCommand[],
    builtinNames: Set<string>,
  ): RegisterResult {
    if (commands.length > 100) {
      throw new Error(`Too many commands: ${commands.length} exceeds limit of 100`);
    }

    const registered: AgentCommand[] = [];
    const skipped: AgentCommand[] = [];

    // Snapshot semantics: remove previous commands for this connection
    this.unregisterByConnection(connectionId);

    for (const cmd of commands) {
      if (builtinNames.has(cmd.name)) {
        skipped.push(cmd);
        continue;
      }

      this.commands.push({ ...cmd, agentId, connectionId });
      registered.push(cmd);
    }

    this.rebuildIndexes();
    return { registered, skipped };
  }

  unregisterByConnection(connectionId: string): boolean {
    const had = this.byConnection.has(connectionId);
    if (!had) return false;

    this.commands = this.commands.filter((c) => c.connectionId !== connectionId);
    this.rebuildIndexes();
    return true;
  }

  clear(): void {
    this.commands = [];
    this.byConnection = new Map();
    this.byName = new Map();
  }

  getAll(): GroupedCommands[] {
    const grouped = new Map<string, AgentCommand[]>();

    for (const cmd of this.commands) {
      let list = grouped.get(cmd.agentId);
      if (!list) {
        list = [];
        grouped.set(cmd.agentId, list);
      }
      const { agentId: _, connectionId: __, ...agentCmd } = cmd;
      list.push(agentCmd);
    }

    const result: GroupedCommands[] = [];
    for (const [agentId, cmds] of grouped) {
      result.push({ agentId, commands: cmds });
    }
    return result;
  }

  getByName(name: string): Array<AgentCommand & { agentId: string }> {
    const stored = this.byName.get(name);
    if (!stored) return [];

    return stored.map(({ connectionId: _, ...rest }) => rest);
  }

  private rebuildIndexes(): void {
    this.byConnection = new Map();
    this.byName = new Map();

    for (const cmd of this.commands) {
      let connList = this.byConnection.get(cmd.connectionId);
      if (!connList) {
        connList = [];
        this.byConnection.set(cmd.connectionId, connList);
      }
      connList.push(cmd);

      let nameList = this.byName.get(cmd.name);
      if (!nameList) {
        nameList = [];
        this.byName.set(cmd.name, nameList);
      }
      nameList.push(cmd);
    }
  }
}

// ─── Singleton ─────────────────────────────────────────

export const commandStore = new CommandStore();
