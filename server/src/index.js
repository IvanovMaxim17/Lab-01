
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { RoomManager } from './rooms.js';
import { attachWebSocket } from './websocket.js';
import { createMatchLogger } from './log/match-logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

// Створюємо логер і менеджер кімнат.
const logger = await createMatchLogger(config.logDir);
const roomManager = new RoomManager();

// Записуємо початкові кімнати та події їх створення і видалення.
logger.write({
  type: 'serverStarted',
  timestamp: new Date().toISOString(),
  rooms: roomManager.getRooms(),
});

roomManager.on('roomCreated', (room) => {
  logger.write({
    type: 'roomCreated',
    timestamp: new Date().toISOString(),
    room: room.toJSON(),
  });
});

roomManager.on('roomDeleted', (room) => {
  logger.write({
    type: 'roomDeleted',
    timestamp: new Date().toISOString(),
    room: room.toJSON(),
  });
});

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });

  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  const chunks = [];
  let totalSize = 0;
  const maxSize = 16 * 1024;

  for await (const chunk of req) {
    totalSize += chunk.length;

    if (totalSize > maxSize) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString('utf8');

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Invalid JSON');
    error.statusCode = 400;
    throw error;
  }
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/rooms' && req.method === 'GET') {
    sendJson(res, 200, {
      rooms: roomManager.getRooms(),
    });

    return true;
  }

  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);

      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        typeof body.name !== 'string'
      ) {
        sendJson(res, 400, {
          error: 'Request must contain a room name',
        });

        return true;
      }

      const name = body.name.trim();

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
      sendJson(res, error.statusCode ?? 400, {
        error: error.message,
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

async function serveStatic(req, res) {
  const rawPath = req.url.split('?')[0];

  let decodedRawPath;

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

  let url;

  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    sendJson(res, 400, {
      error: 'Invalid URL',
    });

    return;
  }

  let pathname;

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
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      uptime: process.uptime(),
    });

    return;
  }

  let url;

  try {
    url = new URL(req.url, `http://${req.headers.host}`);
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

// Підключаємо WebSocket до HTTP-сервера.
// Передаємо логер для запису подій гравців і чату.
const webSocketServer = attachWebSocket(server, roomManager, logger);

server.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});

let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log('Shutting down server...');

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
