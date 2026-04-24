import type { Message } from '../types';

export type CommandStatus = 'pending' | 'completed' | 'failed' | 'timeout';

interface TrackedCommand {
  timestamp: number;
  status: CommandStatus;
  timer: ReturnType<typeof setTimeout>;
}

const TIMEOUT_MS = 30_000;
const tracked = new Map<string, TrackedCommand>();

export function trackCommand(messageId: string): void {
  if (tracked.has(messageId)) return;
  const timer = setTimeout(() => {
    const entry = tracked.get(messageId);
    if (entry && entry.status === 'pending') {
      entry.status = 'timeout';
    }
  }, TIMEOUT_MS);
  tracked.set(messageId, { timestamp: Date.now(), status: 'pending', timer });
}

export function getCommandStatus(messageId: string): CommandStatus | undefined {
  return tracked.get(messageId)?.status;
}

export function handleIncomingMessage(message: Message): void {
  if (!message.reply_to_id) return;
  const entry = tracked.get(message.reply_to_id);
  if (entry && entry.status === 'pending') {
    clearTimeout(entry.timer);
    entry.status = 'completed';
  }
}

export function clearTracking(messageId: string): void {
  const entry = tracked.get(messageId);
  if (entry) {
    clearTimeout(entry.timer);
    tracked.delete(messageId);
  }
}
