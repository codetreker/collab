import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getDb, closeDb } from './db.js';
import { seed } from './seed.js';
import { authMiddleware, registerAuthRoutes } from './auth.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerUserRoutes } from './routes/users.js';
import { registerPollRoutes } from './routes/poll.js';
import { registerWebSocket, getConnectedClientCount } from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? '4900', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  // Init DB + seed
  getDb();
  seed();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // Plugins
  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebsocket);

  // Auth hook for API routes
  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for health, static files, and WebSocket upgrade
    const url = request.url;
    if (
      url === '/health' ||
      url === '/api/v1/poll' ||
      url.startsWith('/assets/') ||
      url === '/ws' ||
      url === '/' ||
      url === '/favicon.ico' ||
      (!url.startsWith('/api/') && !url.startsWith('/ws'))
    ) {
      return;
    }
    await authMiddleware(request, reply);
  });

  // Health endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ws_clients: getConnectedClientCount(),
    };
  });

  // API Routes
  registerAuthRoutes(app);
  registerChannelRoutes(app);
  registerMessageRoutes(app);
  registerUserRoutes(app);
  registerPollRoutes(app);

  // WebSocket
  registerWebSocket(app);

  // Serve upload directory
  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Serve frontend static files (built client)
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: serve index.html for non-API, non-asset routes
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('[server] Shutting down...');
    await app.close();
    closeDb();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start
  await app.listen({ port: PORT, host: HOST });
  console.log(`[server] Collab server listening on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
