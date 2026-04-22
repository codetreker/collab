import type { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

export interface PluginConnection {
  ws: WebSocket;
  userId: string;
  agentId: string;
  alive: boolean;
}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

class PluginManager {
  private connections = new Map<string, PluginConnection>();
  private pendingRequests = new Map<string, PendingRequest>();

  register(agentId: string, ws: WebSocket, userId: string): void {
    const existing = this.connections.get(agentId);
    if (existing) {
      try { existing.ws.close(1000, 'Replaced by new connection'); } catch { /* ignore */ }
    }
    this.connections.set(agentId, { ws, userId, agentId, alive: true });
    console.log(`[plugin-ws] Registered agent ${agentId} (user ${userId})`);
  }

  unregister(agentId: string): void {
    const conn = this.connections.get(agentId);
    if (!conn) return;
    this.connections.delete(agentId);
    for (const [id, pending] of this.pendingRequests) {
      this.pendingRequests.delete(id);
      clearTimeout(pending.timer);
      pending.reject(new Error('Plugin disconnected'));
    }
    console.log(`[plugin-ws] Unregistered agent ${agentId}`);
  }

  getConnection(agentId: string): PluginConnection | undefined {
    return this.connections.get(agentId);
  }

  pushEvent(agentId: string, event: string, data: unknown): void {
    const conn = this.connections.get(agentId);
    if (!conn || conn.ws.readyState !== 1) return;
    conn.ws.send(JSON.stringify({ type: 'event', event, data }));
  }

  broadcastEvent(event: string, data: unknown): void {
    const msg = JSON.stringify({ type: 'event', event, data });
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState === 1) {
        conn.ws.send(msg);
      }
    }
  }

  async request(agentId: string, data: unknown, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<unknown> {
    const conn = this.connections.get(agentId);
    if (!conn || conn.ws.readyState !== 1) {
      throw new Error(`Plugin agent ${agentId} not connected`);
    }

    const id = `req_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} to agent ${agentId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      conn.ws.send(JSON.stringify({ type: 'request', id, data }));
    });
  }

  resolveResponse(id: string, data: unknown, error?: string): void {
    const pending = this.pendingRequests.get(id);
    if (!pending) return;
    this.pendingRequests.delete(id);
    clearTimeout(pending.timer);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(data);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnectedAgentIds(): string[] {
    return [...this.connections.keys()];
  }
}

export const pluginManager = new PluginManager();
