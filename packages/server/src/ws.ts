import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { getDb } from './db.js';
import * as Q from './queries.js';
import type { User } from './types.js';

interface WsClient {
  ws: WebSocket;
  userId: string;
  subscribedChannels: Set<string>;
  alive: boolean;
}

const clients = new Map<WebSocket, WsClient>();
const onlineUsers = new Map<string, Set<WebSocket>>();

export function broadcastToChannel(channelId: string, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.subscribedChannels.has(channelId) && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

function broadcastPresence(userId: string, status: 'online' | 'offline'): void {
  const db = getDb();
  const user = Q.getUserById(db, userId);
  const data = JSON.stringify({
    type: 'presence',
    user_id: userId,
    display_name: user?.display_name,
    status,
  });
  for (const client of clients.values()) {
    if (client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

function addOnlineUser(userId: string, ws: WebSocket): void {
  let sockets = onlineUsers.get(userId);
  const wasOffline = !sockets || sockets.size === 0;
  if (!sockets) {
    sockets = new Set();
    onlineUsers.set(userId, sockets);
  }
  sockets.add(ws);
  if (wasOffline) {
    broadcastPresence(userId, 'online');
  }
}

function removeOnlineUser(userId: string, ws: WebSocket): void {
  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
      broadcastPresence(userId, 'offline');
    }
  }
}

export function getOnlineUserIds(): string[] {
  return [...onlineUsers.keys()];
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const db = getDb();

    let user: User | undefined;

    // Auth from query params
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token');

    if (token) {
      user = Q.getUserByApiKey(db, token);
    }

    if (!user && process.env.NODE_ENV !== 'production') {
      const devUserId = url.searchParams.get('user_id');
      if (devUserId) {
        user = Q.getUserById(db, devUserId);
      }
      if (!user) {
        user = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get() as User | undefined;
      }
    }

    if (!user) {
      socket.close(4001, 'Authentication required');
      return;
    }

    const userId = user.id;

    const client: WsClient = {
      ws: socket,
      userId,
      subscribedChannels: new Set(),
      alive: true,
    };
    clients.set(socket, client);
    addOnlineUser(userId, socket);

    socket.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'subscribe': {
            if (!msg.channel_id) break;
            const channel = Q.getChannel(db, msg.channel_id);
            if (!channel) {
              socket.send(JSON.stringify({ type: 'error', message: 'Channel not found' }));
              break;
            }
            if (!Q.isChannelMember(db, msg.channel_id, userId)) {
              socket.send(JSON.stringify({ type: 'error', message: 'Not a member of this channel' }));
              break;
            }
            client.subscribedChannels.add(msg.channel_id);
            socket.send(JSON.stringify({ type: 'subscribed', channel_id: msg.channel_id }));
            break;
          }

          case 'unsubscribe':
            if (msg.channel_id) {
              client.subscribedChannels.delete(msg.channel_id);
              socket.send(JSON.stringify({ type: 'unsubscribed', channel_id: msg.channel_id }));
            }
            break;

          case 'ping':
            client.alive = true;
            socket.send(JSON.stringify({ type: 'pong' }));
            break;

          case 'pong':
            client.alive = true;
            break;

          case 'send_message': {
            if (!msg.channel_id || !msg.content) {
              socket.send(JSON.stringify({ type: 'error', message: 'channel_id and content are required' }));
              break;
            }

            const channel = Q.getChannel(db, msg.channel_id);
            if (!channel) {
              socket.send(JSON.stringify({ type: 'error', message: 'Channel not found' }));
              break;
            }

            const ct = msg.content_type ?? 'text';
            if (ct !== 'text' && ct !== 'image') {
              socket.send(JSON.stringify({ type: 'error', message: "content_type must be 'text' or 'image'" }));
              break;
            }

            const message = Q.createMessage(
              db,
              msg.channel_id,
              userId,
              msg.content,
              ct,
              msg.reply_to_id ?? null,
              msg.mentions ?? [],
            );

            broadcastToChannel(msg.channel_id, {
              type: 'new_message',
              message,
            });

            socket.send(JSON.stringify({ type: 'message_sent', message }));
            break;
          }

          default:
            socket.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
        }
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      removeOnlineUser(userId, socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
      removeOnlineUser(userId, socket);
    });
  });

  // Heartbeat: ping every 30s, close if no pong within 10s
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      for (const [ws, client] of clients.entries()) {
        if (!client.alive) {
          ws.terminate();
          clients.delete(ws);
          removeOnlineUser(client.userId, ws);
          continue;
        }
        client.alive = false;
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30_000);
  }
}

export function getConnectedClientCount(): number {
  return clients.size;
}
