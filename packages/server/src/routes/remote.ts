import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

export function registerRemoteRoutes(app: FastifyInstance): void {
  // ─── Node CRUD ──────────────────────────────────────

  app.get('/api/v1/remote/nodes', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const db = getDb();
    const nodes = Q.listRemoteNodes(db, userId);
    return { nodes };
  });

  app.post<{
    Body: { machine_name: string };
  }>('/api/v1/remote/nodes', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { machine_name } = request.body ?? {};
    if (!machine_name || typeof machine_name !== 'string' || !machine_name.trim()) {
      return reply.status(400).send({ error: 'machine_name is required' });
    }

    const db = getDb();
    const node = Q.createRemoteNode(db, userId, machine_name.trim());
    return reply.status(201).send({ node });
  });

  app.delete<{
    Params: { id: string };
  }>('/api/v1/remote/nodes/:id', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const db = getDb();
    const node = Q.getRemoteNode(db, request.params.id);
    if (!node) return reply.status(404).send({ error: 'Node not found' });
    if (node.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' });

    Q.deleteRemoteNode(db, node.id);
    return { ok: true };
  });

  // ─── Binding CRUD ───────────────────────────────────

  app.get<{
    Params: { nodeId: string };
  }>('/api/v1/remote/nodes/:nodeId/bindings', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const db = getDb();
    const node = Q.getRemoteNode(db, request.params.nodeId);
    if (!node) return reply.status(404).send({ error: 'Node not found' });
    if (node.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' });

    const bindings = Q.listRemoteBindings(db, node.id);
    return { bindings };
  });

  app.post<{
    Params: { nodeId: string };
    Body: { channel_id: string; path: string; label?: string };
  }>('/api/v1/remote/nodes/:nodeId/bindings', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const db = getDb();
    const node = Q.getRemoteNode(db, request.params.nodeId);
    if (!node) return reply.status(404).send({ error: 'Node not found' });
    if (node.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' });

    const { channel_id, path, label } = request.body ?? {};
    if (!channel_id || !path) {
      return reply.status(400).send({ error: 'channel_id and path are required' });
    }

    const channel = Q.getChannel(db, channel_id);
    if (!channel) return reply.status(404).send({ error: 'Channel not found' });

    const binding = Q.createRemoteBinding(db, node.id, channel_id, path, label ?? null);
    return reply.status(201).send({ binding });
  });

  app.delete<{
    Params: { nodeId: string; id: string };
  }>('/api/v1/remote/nodes/:nodeId/bindings/:id', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const db = getDb();
    const node = Q.getRemoteNode(db, request.params.nodeId);
    if (!node) return reply.status(404).send({ error: 'Node not found' });
    if (node.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' });

    const binding = Q.getRemoteBinding(db, request.params.id);
    if (!binding || binding.node_id !== node.id) {
      return reply.status(404).send({ error: 'Binding not found' });
    }

    Q.deleteRemoteBinding(db, binding.id);
    return { ok: true };
  });

  // Channel-scoped binding list (owner only)
  app.get<{
    Params: { channelId: string };
  }>('/api/v1/channels/:channelId/remote-bindings', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const db = getDb();
    const bindings = Q.listChannelRemoteBindings(db, request.params.channelId, userId);
    return { bindings };
  });
}
