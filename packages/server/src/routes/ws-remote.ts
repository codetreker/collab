import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import { remoteNodeManager } from '../remote-node-manager.js';

interface WsRemoteMessage {
  type: string;
  id?: string;
  data?: unknown;
  error?: string;
}

export function registerWsRemoteRoutes(app: FastifyInstance): void {
  app.get('/ws/remote', { websocket: true }, (socket, request) => {
    const url = new URL(request.url, `http://${(request.headers.host as string) ?? 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Missing token');
      return;
    }

    const db = getDb();
    const node = Q.getRemoteNodeByToken(db, token);

    if (!node) {
      socket.close(4001, 'Invalid token');
      return;
    }

    remoteNodeManager.register(node.id, socket, node.user_id);
    Q.updateRemoteNodeLastSeen(db, node.id);

    socket.on('message', (raw: Buffer) => {
      let msg: WsRemoteMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsRemoteMessage;
      } catch {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
        return;
      }

      switch (msg.type) {
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'pong':
          remoteNodeManager.markAlive(node.id);
          break;

        case 'response':
          if (msg.id) {
            remoteNodeManager.resolveResponse(msg.id, msg.data, msg.error);
          }
          break;

        default:
          socket.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${msg.type}` }));
      }
    });

    socket.on('close', () => {
      remoteNodeManager.unregister(node.id);
    });

    socket.on('error', () => {
      remoteNodeManager.unregister(node.id);
    });
  });
}
