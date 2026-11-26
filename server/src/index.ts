import { performance } from 'node:perf_hooks';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { config } from './config.js';
import { RoomManager, type Room } from './rooms.js';
import { attachWebSocket } from './websocket.js';
import { createMatchLogger } from './log/match-logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

const CreateRoomBodySchema = z.object({
  name: z.string(),
});

class HttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const logger = await createMatchLogger(config.logDir);
const roomManager = new RoomManager();

logger.write({
  type: 'serverStarted',
  timestamp: new Date().toISOString(),
  rooms: roomManager.getRooms(),
});

roomManager.on('roomCreated', (room: Room) => {
  logger.write({
    type: 'roomCreated',
    timestamp: new Date().toISOString(),
    room: room.toJSON(),
  });
});

roomManager.on('roomDeleted', (room: Room) => {
  logger.write({
    type: 'roomDeleted',
    timestamp: new Date().toISOString(),
    room: room.toJSON(),
  });
});

const mimeTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });

  res.end(JSON.stringify(data));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  const maxSize = 16 * 1024;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalSize += buf.length;

    if (totalSize > maxSize) {
      throw new HttpError('Request body is too large', 413);
    }

    chunks.push(buf);
  }

  const body = Buffer.concat(chunks).toString('utf8');

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError('Invalid JSON', 400);
  }
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/api/stats' && req.method === 'GET') {
    const elu = performance.eventLoopUtilization();
    const mem = process.memoryUsage();
    sendJson(res, 200, {
      uptime: Number(process.uptime().toFixed(2)),
      eventLoopUtilization: Number(elu.utilization.toFixed(4)),
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      rooms: roomManager.getStats(),
    });

    return true;
  }

  const botsMatch = /^\/api\/rooms\/([^/]+)\/bots$/.exec(url.pathname);
  if (botsMatch && req.method === 'POST') {
    const roomId = botsMatch[1] ?? '';
    const room = roomManager.getRoom(roomId);
    if (!room) {
      sendJson(res, 404, { error: 'Room not found' });
      return true;
    }
    let count = 1;
    try {
      const body = await readJsonBody(req);
      if (typeof body === 'object' && body !== null && 'count' in body && typeof body.count === 'number') {
        count = Math.max(1, Math.min(32, Math.floor(body.count)));
      }
    } catch {
      count = 1;
    }
    const added: string[] = [];
    for (let i = 0; i < count; i++) {
      const bot = room.match.addBot();
      added.push(bot.name);
    }
    sendJson(res, 201, { added, botsCount: room.match.bots.size });
    return true;
  }

  if (url.pathname === '/api/rooms' && req.method === 'GET') {
    sendJson(res, 200, {
      rooms: roomManager.getRooms(),
    });

    return true;
  }

  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    try {
      const rawBody = await readJsonBody(req);
      const parsedBody = CreateRoomBodySchema.safeParse(rawBody);

      if (!parsedBody.success) {
        sendJson(res, 400, {
          error: 'Request must contain a room name',
        });

        return true;
      }

      const name = parsedBody.data.name.trim();

      if (!name || name.length > 30) {
        sendJson(res, 400, {
          error: 'Room name must contain 1–30 characters',
        });

        return true;
      }

      const room = roomManager.createRoom(name);

      sendJson(res, 201, {
        room: room.toJSON(),
      });
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      const message = error instanceof Error ? error.message : 'Bad request';
      sendJson(res, statusCode, {
        error: message,
      });
    }

    return true;
  }

  if (url.pathname === '/api/rooms') {
    res.setHeader('Allow', 'GET, POST');

    sendJson(res, 405, {
      error: 'Method not allowed',
    });

    return true;
  }

  return false;
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawUrl = req.url ?? '/';
  const rawPath = rawUrl.split('?')[0] ?? '/';

  let decodedRawPath: string;

  try {
    decodedRawPath = decodeURIComponent(rawPath);
  } catch {
    sendJson(res, 400, {
      error: 'Invalid path encoding',
    });

    return;
  }

  if (rawPath.includes('..') || decodedRawPath.includes('..')) {
    sendJson(res, 400, {
      error: 'Invalid path',
    });

    return;
  }

  let url: URL;

  try {
    url = new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    sendJson(res, 400, {
      error: 'Invalid URL',
    });

    return;
  }

  let pathname: string;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, {
      error: 'Invalid path encoding',
    });

    return;
  }

  if (pathname.includes('..')) {
    sendJson(res, 400, {
      error: 'Invalid path',
    });

    return;
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.resolve(clientDist, `.${pathname}`);

  if (
    !filePath.startsWith(clientDist + path.sep) &&
    filePath !== path.join(clientDist, 'index.html')
  ) {
    sendJson(res, 403, {
      error: 'Forbidden',
    });

    return;
  }

  try {
    const content = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType =
      mimeTypes[extension] ?? 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
    });

    res.end(content);
  } catch {
    sendJson(res, 404, {
      error: 'File not found',
    });
  }
}

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url ?? '/';

  if (req.method === 'GET' && rawUrl === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      uptime: process.uptime(),
    });

    return;
  }

  let url: URL;

  try {
    url = new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    sendJson(res, 400, {
      error: 'Invalid URL',
    });

    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const handled = await handleApi(req, res, url);

    if (!handled) {
      sendJson(res, 404, {
        error: 'API endpoint not found',
      });
    }

    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');

    sendJson(res, 405, {
      error: 'Method not allowed',
    });

    return;
  }

  await serveStatic(req, res);
});

const webSocketServer = attachWebSocket(server, roomManager, logger);

server.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});

let isShuttingDown = false;

function shutdown(): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log('Shutting down server...');

  roomManager.closeAll();
  webSocketServer.close();

  server.close(async (error) => {
    if (error) {
      console.error('Shutdown error:', error);
      process.exitCode = 1;
    }

    try {
      logger.write({
        type: 'serverStopped',
        timestamp: new Date().toISOString(),
      });

      await logger.close();
      console.log('Log file flushed and closed.');
    } catch (loggerError) {
      console.error('Logger shutdown error:', loggerError);
      process.exitCode = 1;
    }

    if (!error) {
      console.log('Server closed.');
    }

    if (process.exitCode !== 1) {
      process.exitCode = 0;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);


