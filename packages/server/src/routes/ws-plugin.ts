import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import { pluginManager } from '../plugin-manager.js';

interface WsPluginMessage {
  type: string;
  id?: string;
  data?: unknown;
  error?: string;
  event?: string;
}

export function registerWsPluginRoutes(app: FastifyInstance): void {
  app.get('/ws/plugin', { websocket: true }, (socket, request) => {
    const url = new URL(request.url, `http://${(request.headers.host as string) ?? 'localhost'}`);
    const apiKey = url.searchParams.get('apiKey');

    if (!apiKey) {
      socket.close(4001, 'Missing apiKey');
      return;
    }

    const db = getDb();
    const user = Q.getUserByApiKey(db, apiKey);

    if (!user || user.deleted_at || user.disabled) {
      socket.close(4001, 'Invalid apiKey');
      return;
    }

    const agentId = user.id;
    pluginManager.register(agentId, socket, user.id);

    socket.on('message', (raw: Buffer) => {
      let msg: WsPluginMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsPluginMessage;
      } catch {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
        return;
      }

      switch (msg.type) {
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'pong': {
          const conn = pluginManager.getConnection(agentId);
          if (conn) conn.alive = true;
          break;
        }

        case 'response':
          if (msg.id) {
            pluginManager.resolveResponse(msg.id, msg.data, msg.error);
          }
          break;

        case 'api_request':
          void handleApiRequest(app, agentId, user.id, apiKey, msg);
          break;

        default:
          socket.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${msg.type}` }));
      }
    });

    socket.on('close', () => {
      pluginManager.unregister(agentId);
    });

    socket.on('error', () => {
      pluginManager.unregister(agentId);
    });
  });
}

async function handleApiRequest(
  app: FastifyInstance,
  agentId: string,
  userId: string,
  apiKey: string,
  msg: WsPluginMessage,
): Promise<void> {
  const conn = pluginManager.getConnection(agentId);
  if (!conn || conn.ws.readyState !== 1) return;

  const reqData = msg.data as { method?: string; path?: string; body?: unknown } | undefined;
  if (!reqData?.method || !reqData?.path) {
    conn.ws.send(JSON.stringify({
      type: 'api_response',
      id: msg.id,
      data: { status: 400, body: { error: 'method and path required' } },
    }));
    return;
  }

  try {
    const response = await app.inject({
      method: reqData.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      url: reqData.path,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      payload: reqData.body ? JSON.stringify(reqData.body) : undefined,
    });

    let body: unknown;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = response.body;
    }

    conn.ws.send(JSON.stringify({
      type: 'api_response',
      id: msg.id,
      data: { status: response.statusCode, body },
    }));
  } catch (err) {
    conn.ws.send(JSON.stringify({
      type: 'api_response',
      id: msg.id,
      error: err instanceof Error ? err.message : 'Internal error',
    }));
  }
}
