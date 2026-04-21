import React from 'react';
import type { CommandDefinition } from '../commands/registry';

interface Props {
  commands: CommandDefinition[];
  visible: boolean;
  selectedIndex: number;
  onSelect: (cmd: CommandDefinition) => void;
}

export default function SlashCommandPicker({ commands, visible, selectedIndex, onSelect }: Props) {
  if (!visible) return null;

  if (commands.length === 0) {
    return (
      <div className="slash-command-picker">
        <div className="slash-command-empty">没有找到命令</div>
      </div>
    );
  }

  return (
    <div className="slash-command-picker">
      {commands.map((cmd, idx) => (
        <button
          key={cmd.name}
          className={`slash-command-option ${idx === selectedIndex ? 'slash-command-option-active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd);
          }}
        >
          <span className="slash-command-name">/{cmd.name}</span>
          <span className="slash-command-desc">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}
