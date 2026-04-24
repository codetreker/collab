import React, { useState, useCallback, useMemo } from 'react';
import type { CommandDefinition, RemoteCommand, CommandGroup } from '../commands/registry';

interface Props {
  groups: CommandGroup[];
  visible: boolean;
  selectedIndex: number;
  onSelect: (cmd: CommandDefinition | RemoteCommand) => void;
  onClose: () => void;
}

export function isRemoteCommand(cmd: CommandDefinition | RemoteCommand): cmd is RemoteCommand {
  return 'agentId' in cmd;
}

function collectRemotesByName(groups: CommandGroup[], name: string): RemoteCommand[] {
  const result: RemoteCommand[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (isRemoteCommand(item) && item.name === name) {
        result.push(item);
      }
    }
  }
  return result;
}

export default function SlashCommandPicker({ groups, visible, selectedIndex, onSelect, onClose }: Props) {
  const [agentSelecting, setAgentSelecting] = useState<{ commandName: string; agents: RemoteCommand[] } | null>(null);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);

  const handleItemClick = useCallback((cmd: CommandDefinition | RemoteCommand) => {
    if (isRemoteCommand(cmd)) {
      const matches = collectRemotesByName(groups, cmd.name);
      if (matches.length > 1) {
        setAgentSelecting({ commandName: cmd.name, agents: matches });
        setSelectedAgentIndex(0);
        return;
      }
    }
    onSelect(cmd);
  }, [groups, onSelect]);

  const handleAgentSelect = useCallback((cmd: RemoteCommand) => {
    setAgentSelecting(null);
    onSelect(cmd);
  }, [onSelect]);

  const handleBackToMain = useCallback(() => {
    setAgentSelecting(null);
    setSelectedAgentIndex(0);
  }, []);

  if (!visible) return null;

  if (agentSelecting) {
    return (
      <div className="slash-command-picker">
        <div className="slash-command-header">
          <span>⚡ /{agentSelecting.commandName} — Choose Agent</span>
          <button className="slash-command-close" onMouseDown={(e) => { e.preventDefault(); handleBackToMain(); }}>✕</button>
        </div>
        <div className="slash-command-subtitle">Multiple agents provide this command:</div>
        {agentSelecting.agents.map((agent, idx) => (
          <button
            key={agent.agentId}
            className={`slash-command-agent-card ${idx === selectedAgentIndex ? 'slash-command-agent-card-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); handleAgentSelect(agent); }}
          >
            <span className="slash-command-agent-name">🤖 {agent.agentName}</span>
            <span className="slash-command-agent-desc">{agent.description}</span>
          </button>
        ))}
      </div>
    );
  }

  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  if (totalCount === 0) {
    return (
      <div className="slash-command-picker">
        <div className="slash-command-header">
          <span>⚡ Slash Commands</span>
          <button className="slash-command-close" onMouseDown={(e) => { e.preventDefault(); onClose(); }}>✕</button>
        </div>
        <div className="slash-command-empty">没有找到命令</div>
      </div>
    );
  }

  let flatIndex = 0;

  return (
    <div className="slash-command-picker">
      <div className="slash-command-header">
        <span>⚡ Slash Commands</span>
        <button className="slash-command-close" onMouseDown={(e) => { e.preventDefault(); onClose(); }}>✕</button>
      </div>
      {groups.map((group) => (
        <React.Fragment key={group.group}>
          <div className="slash-command-group-title">
            {group.group === 'System' ? '── System ──' : `── 🤖 ${group.group} ──`}
          </div>
          {group.items.map((cmd) => {
            const currentIndex = flatIndex++;
            return (
              <button
                key={`${group.group}-${cmd.name}`}
                className={`slash-command-option ${currentIndex === selectedIndex ? 'slash-command-option-active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); handleItemClick(cmd); }}
              >
                <span className="slash-command-name">/{cmd.name}</span>
                <span className="slash-command-desc">{cmd.description}</span>
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
