import React from 'react';
import type { CommandStatus } from '../hooks/useCommandTracking';

interface Props {
  status: CommandStatus;
  agentName?: string;
}

const STATUS_CONFIG: Record<CommandStatus, { icon: string; text: string; hint?: string }> = {
  pending:   { icon: '⏳', text: '执行中...' },
  completed: { icon: '✅', text: '执行完成' },
  failed:    { icon: '❌', text: '执行失败' },
  timeout:   { icon: '⏰', text: '执行超时', hint: 'Agent 可能不在线' },
};

export default function CommandResultCard({ status, agentName }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <div className={`command-result-card command-result-${status}`}>
      <span className="command-result-icon">{config.icon}</span>
      <span className="command-result-text">{config.text}</span>
      {agentName && <span className="command-result-agent">{agentName}</span>}
      {config.hint && <span className="command-result-hint">{config.hint}</span>}
    </div>
  );
}
