import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
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
import { registerStreamRoutes } from './routes/stream.js';
import { registerUploadRoutes } from './routes/upload.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerDmRoutes } from './routes/dm.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerReactionRoutes } from './routes/reactions.js';
import { registerWebSocket, getConnectedClientCount, getOnlineUserIds } from './ws.js';
import * as Q from './queries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? '4900', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  getDb();
  seed();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // Plugins
  // CORS — restrict origin in production, allow all in dev
  const corsOrigin = process.env.NODE_ENV === 'development'
    ? true
    : (process.env.CORS_ORIGIN ?? 'https://collab.codetrek.work');
  await app.register(fastifyCors, { origin: corsOrigin });
  await app.register(fastifyWebsocket);
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(fastifyRateLimit, { global: false });

  // Serve uploads directory
  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Auth hook for API routes
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    if (
      url === '/health' ||
      url === '/api/v1/poll' ||
      url === '/api/v1/stream' ||
      url.startsWith('/api/v1/stream?') ||
      url.startsWith('/api/v1/auth/') ||
      url.startsWith('/assets/') ||
      url.startsWith('/uploads/') ||
      url === '/ws' ||
      url.startsWith('/ws?') ||
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

  // Online users endpoint
  app.get('/api/v1/online', async () => {
    const wsOnline = getOnlineUserIds();
    const pollOnline = Q.getRecentlySeenUserIds(getDb());
    const merged = [...new Set([...wsOnline, ...pollOnline])];
    return { user_ids: merged };
  });

  // API Routes
  registerAuthRoutes(app);
  registerChannelRoutes(app);
  registerMessageRoutes(app);
  registerUserRoutes(app);
  registerPollRoutes(app);
  registerStreamRoutes(app);
  registerUploadRoutes(app);
  registerAdminRoutes(app);
  registerAgentRoutes(app);
  registerReactionRoutes(app);
  registerDmRoutes(app);

  // WebSocket
  registerWebSocket(app);

  // Serve frontend static files (built client)
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const urlPath = request.url.split('?')[0];
      if (path.extname(urlPath)) {
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

  await app.listen({ port: PORT, host: HOST });
  console.log(`[server] Collab server listening on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
