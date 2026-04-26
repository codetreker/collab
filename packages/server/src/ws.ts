import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getDb } from './db.js';
import * as Q from './queries.js';
import { commandStore } from './command-store.js';
import type { AgentCommand, User } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

interface JwtPayload {
  userId: string;
  email: string;
}

function extractBorgeeCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)borgee_token=([^;]+)/);
  return match?.[1];
}

async function authenticateWsRequest(request: { headers: Record<string, string | string[] | undefined>; url: string }): Promise<User | undefined> {
  const db = getDb();

  // 1. Check Authorization header (agent/API key auth)
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = Q.getUserByApiKey(db, token);
    if (user) {
      if (user.deleted_at || user.disabled) return undefined;
      console.log(`[ws] Authenticated via API key (header): ${user.id}`);
      return user;
    }
  }

  // Deprecated: query string token (will be removed in a future version)
  const url = new URL(request.url, `http://${(request.headers.host as string) ?? 'localhost'}`);
  const token = url.searchParams.get('token');
  if (token) {
    const user = Q.getUserByApiKey(db, token);
    if (user) {
      if (user.deleted_at || user.disabled) return undefined;
      console.warn(`[ws] Authenticated via deprecated query string token: ${user.id}`);
      return user;
    }
  }

  // 2. JWT cookie auth (browser)
  const jwtToken = extractBorgeeCookie(request.headers.cookie as string | undefined);
  if (jwtToken && JWT_SECRET) {
    try {
      const payload = jwt.verify(jwtToken, JWT_SECRET) as JwtPayload;
      const user = Q.getUserById(db, payload.userId);
      if (user) {
        if (user.deleted_at || user.disabled) return undefined;
        console.log(`[ws] Authenticated via JWT cookie: ${user.id}`);
        return user;
      }
    } catch (err) {
      console.warn('[ws] JWT verification failed:', err instanceof Error ? err.message : String(err));
    }
  }

  // 3. Dev mode bypass (explicit opt-in only)
  if (process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === 'true') {
    const devUserId = url.searchParams.get('user_id');
    if (devUserId) {
      const user = Q.getUserById(db, devUserId);
      if (user && !user.deleted_at && !user.disabled) return user;
    }
    return db.prepare("SELECT * FROM users WHERE role = 'admin' AND deleted_at IS NULL AND disabled = 0 LIMIT 1").get() as User | undefined;
  }

  return undefined;
}

const BUILTIN_NAMES = new Set(['help', 'leave', 'topic', 'invite', 'dm', 'status', 'clear', 'nick']);
const CMD_NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;

interface WsClient {
  ws: WebSocket;
  userId: string;
  connectionId: string;
  role?: string;
  subscribedChannels: Set<string>;
  alive: boolean;
}

const clients = new Map<WebSocket, WsClient>();
const onlineUsers = new Map<string, Set<WebSocket>>();

export function broadcastToChannel(channelId: string, payload: unknown, excludeWs?: WebSocket): void {
  const data = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.ws !== excludeWs && client.subscribedChannels.has(channelId) && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

export function broadcastToUser(userId: string, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.userId === userId && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

export function unsubscribeUserFromChannel(userId: string, channelId: string): void {
  for (const client of clients.values()) {
    if (client.userId === userId) {
      client.subscribedChannels.delete(channelId);
    }
  }
}

export function broadcastToAll(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.ws.readyState === 1) {
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
    (async () => {
      const user = await authenticateWsRequest(request);

      if (!user) {
        socket.close(4001, 'Authentication required');
        return;
      }

      const db = getDb();
      const userId = user.id;

    const client: WsClient = {
      ws: socket,
      userId,
      connectionId: randomUUID(),
      role: user.role,
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
            const isMember = Q.isChannelMember(db, msg.channel_id, userId);
            const isAdmin = user.role === 'admin';
            if (!isMember && !isAdmin) {
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

          case 'typing': {
            if (!msg.channel_id) break;
            if (!client.subscribedChannels.has(msg.channel_id)) break;
            broadcastToChannel(msg.channel_id, {
              type: 'typing',
              channel_id: msg.channel_id,
              user_id: userId,
              display_name: user.display_name,
            }, socket);
            break;
          }

          case 'send_message': {
            if (!msg.channel_id || !msg.content) {
              socket.send(JSON.stringify({ type: 'error', message: 'channel_id and content are required' }));
              break;
            }

            const channel = Q.getChannel(db, msg.channel_id);
            if (!channel) {
              socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'NOT_FOUND', message: 'Channel not found' }));
              break;
            }

            if (!Q.isChannelMember(db, msg.channel_id, userId)) {
              socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'NOT_MEMBER', message: 'Not a member of this channel' }));
              break;
            }

            if (user.role !== 'admin') {
              const hasPerm = db.prepare(
                "SELECT 1 FROM user_permissions WHERE user_id = ? AND permission = 'message.send' AND (scope = '*' OR scope = ?) LIMIT 1",
              ).get(userId, `channel:${msg.channel_id}`);
              if (!hasPerm) {
                socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'PERMISSION_DENIED', message: 'Permission denied: message.send required' }));
                break;
              }
            }

            const ct = msg.content_type ?? 'text';
            if (!['text', 'image', 'command'].includes(ct)) {
              socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'INVALID_CONTENT_TYPE', message: "content_type must be 'text', 'image', or 'command'" }));
              break;
            }

            // Command-specific validation
            if (ct === 'command') {
              if (!Array.isArray(msg.mentions) || msg.mentions.length === 0) {
                socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'INVALID_COMMAND', message: 'Command messages must mention at least one agent' }));
                break;
              }
              try {
                const parsed = JSON.parse(msg.content);
                if (typeof parsed.command !== 'string' || !parsed.command) {
                  socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'INVALID_COMMAND', message: 'Command content must include a "command" field' }));
                  break;
                }
                if (!Array.isArray(parsed.params)) {
                  socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'INVALID_COMMAND', message: 'Command content must include a "params" array' }));
                  break;
                }
              } catch {
                socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'INVALID_COMMAND', message: 'Command content must be valid JSON' }));
                break;
              }
            }

            try {
              const message = Q.createMessage(
                db,
                msg.channel_id,
                userId,
                msg.content,
                ct,
                msg.reply_to_id ?? null,
                msg.mentions ?? [],
              );

              const clientMessageId = msg.client_message_id ?? null;

              socket.send(JSON.stringify({
                type: 'message_ack',
                client_message_id: clientMessageId,
                message,
              }));

              broadcastToChannel(msg.channel_id, {
                type: 'new_message',
                message,
              }, clientMessageId ? socket : undefined);
            } catch {
              socket.send(JSON.stringify({ type: 'message_nack', client_message_id: msg.client_message_id ?? null, code: 'INTERNAL_ERROR', message: 'Failed to create message' }));
            }
            break;
          }

          case 'register_commands': {
            if (client.role !== 'agent') {
              socket.send(JSON.stringify({ type: 'error', message: 'Only agents can register commands' }));
              break;
            }
            if (!Array.isArray(msg.commands)) {
              socket.send(JSON.stringify({ type: 'error', message: 'commands must be an array' }));
              break;
            }
            {
              let validationError: string | null = null;
              for (const cmd of msg.commands as Record<string, unknown>[]) {
                if (typeof cmd.name !== 'string' || !CMD_NAME_RE.test(cmd.name)) {
                  validationError = `name must match ${CMD_NAME_RE}`;
                  break;
                }
                if (typeof cmd.description !== 'string' || (cmd.description as string).length > 200) {
                  validationError = 'description must be a string with length <= 200';
                  break;
                }
                if (typeof cmd.usage !== 'string' || (cmd.usage as string).length > 200) {
                  validationError = 'usage must be a string with length <= 200';
                  break;
                }
                if (cmd.params !== undefined) {
                  if (!Array.isArray(cmd.params)) {
                    validationError = 'params must be an array';
                    break;
                  }
                  for (const p of cmd.params as Record<string, unknown>[]) {
                    if (typeof p.name !== 'string' || typeof p.type !== 'string') {
                      validationError = 'each param must have name (string) and type (string)';
                      break;
                    }
                  }
                  if (validationError) break;
                }
              }
              if (validationError) {
                socket.send(JSON.stringify({ type: 'error', message: `Invalid command definition: ${validationError}` }));
                break;
              }
            }
            try {
              const result = commandStore.register(
                client.userId,
                client.connectionId,
                msg.commands as AgentCommand[],
                BUILTIN_NAMES,
              );
              socket.send(JSON.stringify({
                type: 'commands_registered',
                registered: result.registered,
                skipped: result.skipped,
              }));
              broadcastToAll({ type: 'commands_updated' });
            } catch (err) {
              socket.send(JSON.stringify({
                type: 'error',
                message: err instanceof Error ? err.message : 'Failed to register commands',
              }));
            }
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
      const hadCommands = commandStore.unregisterByConnection(client.connectionId);
      if (hadCommands) broadcastToAll({ type: 'commands_updated' });
    });

    socket.on('error', () => {
      clients.delete(socket);
      removeOnlineUser(userId, socket);
      const hadCommands = commandStore.unregisterByConnection(client.connectionId);
      if (hadCommands) broadcastToAll({ type: 'commands_updated' });
    });
    })().catch(() => {
      if (socket.readyState === 1) {
        socket.close(4001, 'Authentication failed');
      }
    });
  });

  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      for (const [ws, client] of clients.entries()) {
        if (!client.alive) {
          const hadCommands = commandStore.unregisterByConnection(client.connectionId);
          if (hadCommands) broadcastToAll({ type: 'commands_updated' });
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

  app.addHook('onClose', async () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    for (const [ws, client] of clients.entries()) {
      ws.close(1001, 'Server shutting down');
      clients.delete(ws);
      removeOnlineUser(client.userId, ws);
    }
  });
}

export function getConnectedClientCount(): number {
  return clients.size;
}
