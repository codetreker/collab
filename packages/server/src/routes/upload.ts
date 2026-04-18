import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads');

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export function registerUploadRoutes(app: FastifyInstance): void {
  app.post('/api/v1/upload', async (request, reply) => {
    const senderId = request.currentUser?.id;
    if (!senderId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const mime = data.mimetype;
    if (!ALLOWED_MIMES.has(mime)) {
      return reply.status(400).send({ error: 'Only image files are allowed (jpg, png, gif, webp)' });
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxSize = 10 * 1024 * 1024; // 10MB

    for await (const chunk of data.file) {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        return reply.status(413).send({ error: 'File too large. Maximum size is 10MB' });
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const ext = MIME_TO_EXT[mime] ?? path.extname(data.filename || '.bin');
    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    fs.writeFileSync(filepath, buffer);

    return reply.status(201).send({
      url: `/uploads/${filename}`,
      content_type: mime,
    });
  });
}
