import WebSocket from 'ws';
import { ls, readFile, stat } from './fs-ops.js';

interface WsMessage {
  type: string;
  id?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export class RemoteAgent {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(
    private serverUrl: string,
    private token: string,
    private allowedDirs: string[],
  ) {}

  connect(): void {
    this.closed = false;
    const url = `${this.serverUrl}/ws/remote?token=${encodeURIComponent(this.token)}`;
    console.log(`[remote-agent] Connecting to ${this.serverUrl}...`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[remote-agent] Connected');
      this.reconnectDelay = 1000;
      this.startHeartbeat();
    });

    this.ws.on('message', (raw: Buffer) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsMessage;
      } catch {
        return;
      }
      this.handleMessage(msg);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[remote-agent] Disconnected: ${code} ${reason.toString()}`);
      this.stopHeartbeat();
      if (!this.closed) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[remote-agent] Error: ${err.message}`);
    });
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.ws?.close(1000, 'Agent shutting down');
  }

  private handleMessage(msg: WsMessage): void {
    switch (msg.type) {
      case 'pong':
        break;
      case 'request':
        if (msg.id && msg.data) {
          void this.handleRequest(msg.id, msg.data);
        }
        break;
      default:
        break;
    }
  }

  private async handleRequest(id: string, data: Record<string, unknown>): Promise<void> {
    const action = data.action as string;
    const targetPath = data.path as string;
    let result: unknown;

    switch (action) {
      case 'ls':
        result = ls(targetPath, this.allowedDirs);
        break;
      case 'read':
        result = readFile(targetPath, this.allowedDirs);
        break;
      case 'stat':
        result = stat(targetPath, this.allowedDirs);
        break;
      default:
        result = { error: `Unknown action: ${action}` };
    }

    const hasError = result && typeof result === 'object' && 'error' in result;
    if (hasError) {
      this.send({ type: 'response', id, data: result });
    } else {
      this.send({ type: 'response', id, data: result });
    }
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    console.log(`[remote-agent] Reconnecting in ${this.reconnectDelay}ms...`);
    setTimeout(() => {
      if (!this.closed) this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}
