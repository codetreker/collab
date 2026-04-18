import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

interface WsClient {
  ws: WebSocket;
  userId: string;
  subscribedChannels: Set<string>;
}

const clients = new Map<WebSocket, WsClient>();

export function broadcastToChannel(channelId: string, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.subscribedChannels.has(channelId) && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const userId = (request as any).currentUser?.id ?? 'anonymous';

    const client: WsClient = {
      ws: socket,
      userId,
      subscribedChannels: new Set(),
    };
    clients.set(socket, client);

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'subscribe':
            if (msg.channel_id) {
              client.subscribedChannels.add(msg.channel_id);
            }
            break;

          case 'unsubscribe':
            if (msg.channel_id) {
              client.subscribedChannels.delete(msg.channel_id);
            }
            break;

          case 'ping':
            socket.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            socket.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
        }
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
    });
  });
}

export function getConnectedClientCount(): number {
  return clients.size;
}
