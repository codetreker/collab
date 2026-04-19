import React from 'react';
import type { ConnectionState } from '../types';

interface Props {
  state: ConnectionState;
}

export default function ConnectionStatus({ state }: Props) {
  if (state === 'connected') return null;

  const config: Record<string, { text: string; className: string }> = {
    connecting: { text: '连接中...', className: 'conn-banner conn-connecting' },
    reconnecting: { text: '连接断开，正在重连...', className: 'conn-banner conn-reconnecting' },
    disconnected: { text: '连接已断开', className: 'conn-banner conn-disconnected' },
  };

  const c = config[state] ?? config['disconnected']!;

  return (
    <div className={c.className}>
      <span className="conn-dot" />
      {c.text}
    </div>
  );
}
