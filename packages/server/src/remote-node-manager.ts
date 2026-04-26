import type { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface RemoteConnection {
  ws: WebSocket;
  nodeId: string;
  userId: string;
  alive: boolean;
}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

class RemoteNodeManager {
  private connections = new Map<string, RemoteConnection>();
  private pendingRequests = new Map<string, PendingRequest>();

  register(nodeId: string, ws: WebSocket, userId: string): void {
    const existing = this.connections.get(nodeId);
    if (existing) {
      try { existing.ws.close(1000, 'Replaced by new connection'); } catch { /* ignore */ }
    }
    this.connections.set(nodeId, { ws, nodeId, userId, alive: true });
    console.log(`[remote-ws] Registered node ${nodeId} (user ${userId})`);
  }

  unregister(nodeId: string): void {
    const conn = this.connections.get(nodeId);
    if (!conn) return;
    this.connections.delete(nodeId);
    for (const [id, pending] of this.pendingRequests) {
      this.pendingRequests.delete(id);
      clearTimeout(pending.timer);
      pending.reject(new Error('Remote node disconnected'));
    }
    console.log(`[remote-ws] Unregistered node ${nodeId}`);
  }

  isOnline(nodeId: string): boolean {
    const conn = this.connections.get(nodeId);
    return !!conn && conn.ws.readyState === 1;
  }

  async request(nodeId: string, data: unknown, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<unknown> {
    const conn = this.connections.get(nodeId);
    if (!conn || conn.ws.readyState !== 1) {
      throw new Error(`Remote node ${nodeId} not connected`);
    }

    const id = `req_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} to node ${nodeId} timed out after ${timeoutMs}ms`));
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

  getConnection(nodeId: string): RemoteConnection | undefined {
    return this.connections.get(nodeId);
  }

  markAlive(nodeId: string): void {
    const conn = this.connections.get(nodeId);
    if (conn) conn.alive = true;
  }
}

export const remoteNodeManager = new RemoteNodeManager();
