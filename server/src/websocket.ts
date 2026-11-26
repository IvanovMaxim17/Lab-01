import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { z } from 'zod';
import {
  TICK_RATE,
  clampInput,
  encodeMessage,
  decodeMessage,
} from 'shared';
import type { ClientWebSocket, RoomManager } from './rooms.js';
import type { MatchLogger } from './log/match-logger.js';
import { config } from './config.js';
import {
  logger as appLogger,
  activePlayersGauge,
  wsMessagesTotal,
  wsBytesTotal,
  rejectionsTotal,
} from './observability.js';

const MAX_MESSAGE_SIZE = 16 * 1024;
const JOIN_TIMEOUT = 5000;
const PING_INTERVAL = 15000;
const MAX_MESSAGES_PER_SECOND = 120;

function toClientSocket(ws: WebSocket): ClientWebSocket {
  return ws as ClientWebSocket;
}

function isOriginAllowed(originHeader: string | undefined): boolean {
  if (config.allowedOrigins.includes('*')) {
    return true;
  }
  if (!originHeader) {
    return false;
  }
  return config.allowedOrigins.includes(originHeader);
}

function getClientIp(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function sendTracked(
  ws: WebSocket,
  payload: string | ArrayBuffer | ArrayBufferView,
): void {
  const bytes =
    typeof payload === 'string'
      ? Buffer.byteLength(payload)
      : payload.byteLength;
  wsMessagesTotal.inc({ direction: 'out' });
  wsBytesTotal.inc({ direction: 'out' }, bytes);
  ws.send(payload);
}

const JoinMessageSchema = z.object({
  type: z.literal('join'),
  roomId: z.string(),
  name: z.string(),
  format: z.enum(['binary', 'json']).optional(),
});

const InputMessageSchema = z.object({
  type: z.literal('input'),
  seq: z.number().optional(),
  tick: z.number().optional(),
  turn: z.number().optional(),
  thrust: z.union([z.number(), z.boolean()]).optional(),
  fire: z.union([z.number(), z.boolean()]).optional(),
});

const PingMessageSchema = z.object({
  type: z.literal('ping'),
  clientTime: z.number().optional(),
});

const FormatMessageSchema = z.object({
  type: z.literal('format'),
  format: z.enum(['binary', 'json']),
});

const ChatMessageSchema = z.object({
  type: z.literal('chat'),
  text: z.string(),
});

const LeaveMessageSchema = z.object({
  type: z.literal('leave'),
});

const ClientJsonMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  PingMessageSchema,
  FormatMessageSchema,
  ChatMessageSchema,
  LeaveMessageSchema,
]);

function rawDataToBuffer(raw: RawData): ArrayBuffer | ArrayBufferView {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw);
  }
  return raw;
}

export interface WebSocketController {
  close(): void;
}

export function attachWebSocket(
  server: Server,
  roomManager: RoomManager,
  logger: MatchLogger,
): WebSocketController {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_SIZE,
  });

  const connectionsByIp = new Map<string, number>();

  server.on('upgrade', (request, socket, head) => {
    let url: URL;

    try {
      url = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      rejectionsTotal.inc({ reason: 'invalid_upgrade_url' });
      socket.destroy();
      return;
    }

    if (url.pathname !== '/ws') {
      rejectionsTotal.inc({ reason: 'invalid_ws_path' });
      socket.destroy();
      return;
    }

    if (!isOriginAllowed(request.headers.origin)) {
      rejectionsTotal.inc({ reason: 'forbidden_origin' });
      appLogger.warn(
        { origin: request.headers.origin ?? null },
        'Rejected WebSocket upgrade due to Origin policy',
      );
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const ip = getClientIp(request);
    const activeFromIp = connectionsByIp.get(ip) ?? 0;
    if (activeFromIp >= config.maxConnectionsPerIp) {
      rejectionsTotal.inc({ reason: 'max_connections_per_ip' });
      appLogger.warn(
        { ip, activeFromIp, limit: config.maxConnectionsPerIp },
        'Rejected WebSocket upgrade due to IP connection limit',
      );
      socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (rawWs: WebSocket, request?: IncomingMessage) => {
    const ws = toClientSocket(rawWs);
    const ip = request ? getClientIp(request) : 'unknown';
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);

    ws.isAlive = true;
    ws.missedPongs = 0;
    ws.room = null;
    ws.playerName = null;
    ws.messageCount = 0;
    ws.clientIp = ip;

    const joinTimer = setTimeout(() => {
      if (!ws.room && ws.readyState === ws.OPEN) {
        rejectionsTotal.inc({ reason: 'join_timeout' });
        ws.close(1008, 'Join timeout');
      }
    }, JOIN_TIMEOUT);

    ws.on('pong', () => {
      ws.isAlive = true;
      ws.missedPongs = 0;
    });

    ws.on('message', (rawMessage: RawData, isBinary: boolean) => {
      const incomingBytes = Array.isArray(rawMessage)
        ? rawMessage.reduce((sum, buf) => sum + buf.byteLength, 0)
        : rawMessage.byteLength;
      wsMessagesTotal.inc({ direction: 'in' });
      wsBytesTotal.inc({ direction: 'in' }, incomingBytes);

      ws.messageCount += 1;

      if (ws.messageCount > MAX_MESSAGES_PER_SECOND) {
        rejectionsTotal.inc({ reason: 'rate_limit' });
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      if (isBinary) {
        let binaryMessage;
        try {
          binaryMessage = decodeMessage(rawDataToBuffer(rawMessage));
        } catch {
          rejectionsTotal.inc({ reason: 'invalid_binary' });
          ws.close(1007, 'Invalid binary frame');
          return;
        }

        if (binaryMessage.type === 'input') {
          if (!ws.room) {
            rejectionsTotal.inc({ reason: 'not_in_room' });
            ws.close(1008, 'Not in a room');
            return;
          }
          const cleanInput = clampInput(binaryMessage);
          ws.room.match.enqueueInput(ws, cleanInput);
          return;
        }

        if (binaryMessage.type === 'ping') {
          if (ws.readyState === ws.OPEN) {
            const player = ws.room?.match.getPlayer(ws);
            const format = player?.format ?? 'binary';
            const pongPayload = encodeMessage(
              { type: 'pong', clientTime: Number(binaryMessage.clientTime) || 0 },
              format,
            );
            sendTracked(ws, pongPayload);
          }
          return;
        }

        rejectionsTotal.inc({ reason: 'unknown_binary_type' });
        ws.close(1008, 'Unknown binary message type');
        return;
      }

      let rawJson: unknown;
      try {
        const text = Array.isArray(rawMessage)
          ? Buffer.concat(rawMessage).toString('utf8')
          : rawMessage instanceof ArrayBuffer
            ? Buffer.from(rawMessage).toString('utf8')
            : rawMessage.toString('utf8');
        rawJson = JSON.parse(text);
      } catch {
        rejectionsTotal.inc({ reason: 'invalid_json' });
        ws.close(1007, 'Invalid JSON');
        return;
      }

      if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
        rejectionsTotal.inc({ reason: 'invalid_message_shape' });
        ws.close(1008, 'Invalid message');
        return;
      }

      const parsed = ClientJsonMessageSchema.safeParse(rawJson);
      if (!parsed.success) {
        rejectionsTotal.inc({ reason: 'schema_validation' });
        const rawType =
          typeof rawJson === 'object' && rawJson !== null && 'type' in rawJson
            ? rawJson.type
            : undefined;
        if (rawType === 'join') {
          ws.close(1008, 'Invalid join message');
        } else if (rawType === 'chat') {
          ws.close(1008, 'Invalid chat message');
        } else {
          ws.close(1008, 'Unknown message type');
        }
        return;
      }

      const message = parsed.data;

      if (message.type === 'join') {
        if (ws.room) {
          rejectionsTotal.inc({ reason: 'already_joined' });
          ws.close(1008, 'Already joined');
          return;
        }

        const name = message.name.trim();
        const room = roomManager.getRoom(message.roomId);

        if (!name || name.length > 20 || !room) {
          rejectionsTotal.inc({ reason: 'invalid_join_target' });
          ws.close(1008, 'Invalid room or player name');
          return;
        }

        if (room.players.size >= config.maxPlayersPerRoom) {
          rejectionsTotal.inc({ reason: 'room_full' });
          ws.close(1008, 'Room is full');
          return;
        }

        clearTimeout(joinTimer);

        const format = message.format === 'json' ? 'json' : 'binary';
        ws.room = room;
        ws.playerName = name;
        room.players.add(ws);

        const player = room.match.addPlayer(ws, name, format);
        activePlayersGauge.inc();

        room.emit('playerJoined', {
          name,
          playersCount: room.players.size,
        });

        appLogger.info(
          { event: 'playerJoined', roomId: room.id, playerName: name, playersCount: room.players.size },
          'Player joined room',
        );

        logger.write({
          type: 'playerJoined',
          timestamp: new Date().toISOString(),
          roomId: room.id,
          roomName: room.name,
          playerName: name,
          playersCount: room.players.size,
        });

        if (ws.readyState === ws.OPEN) {
          sendTracked(
            ws,
            JSON.stringify({
              type: 'joined',
              room: room.toJSON(),
              playerName: name,
              playerId: player.id,
              shipId: player.ship?.id ?? 0,
              tickRate: TICK_RATE,
              format: player.format,
              version: config.appVersion,
            }),
          );
        }

        return;
      }

      if (message.type === 'input') {
        if (!ws.room) {
          rejectionsTotal.inc({ reason: 'not_in_room' });
          ws.close(1008, 'Not in a room');
          return;
        }

        const cleanInput = clampInput(message);
        ws.room.match.enqueueInput(ws, cleanInput);
        return;
      }

      if (message.type === 'ping') {
        if (ws.readyState === ws.OPEN) {
          const player = ws.room?.match.getPlayer(ws);
          const format = player?.format ?? 'json';
          const pongPayload = encodeMessage(
            { type: 'pong', clientTime: Number(message.clientTime) || 0 },
            format,
          );
          sendTracked(ws, pongPayload);
        }
        return;
      }

      if (message.type === 'format') {
        if (!ws.room) return;
        const nextFormat = message.format === 'json' ? 'json' : 'binary';
        ws.room.match.setPlayerFormat(ws, nextFormat);

        if (ws.readyState === ws.OPEN) {
          sendTracked(
            ws,
            JSON.stringify({
              type: 'formatChanged',
              format: nextFormat,
            }),
          );
        }
        return;
      }

      if (message.type === 'chat') {
        if (!ws.room || !message.text.trim() || message.text.length > 500) {
          rejectionsTotal.inc({ reason: 'invalid_chat' });
          ws.close(1008, 'Invalid chat message');
          return;
        }

        const chatMessage = {
          type: 'chat',
          name: ws.playerName,
          text: message.text.trim(),
          time: new Date().toISOString(),
        };

        logger.write({
          type: 'chat',
          timestamp: chatMessage.time,
          roomId: ws.room.id,
          roomName: ws.room.name,
          playerName: ws.playerName,
          text: chatMessage.text,
        });

        const serializedChat = JSON.stringify(chatMessage);
        for (const player of ws.room.players) {
          if (
            player.readyState === player.OPEN &&
            player.bufferedAmount < 64 * 1024
          ) {
            sendTracked(player, serializedChat);
          }
        }

        return;
      }

      if (message.type === 'leave') {
        ws.close(1000, 'Player left');
        return;
      }
    });

    ws.on('close', () => {
      clearTimeout(joinTimer);

      const prevCount = connectionsByIp.get(ip) ?? 0;
      if (prevCount <= 1) {
        connectionsByIp.delete(ip);
      } else {
        connectionsByIp.set(ip, prevCount - 1);
      }

      if (ws.room) {
        const room = ws.room;

        room.match.removePlayer(ws);
        room.players.delete(ws);
        activePlayersGauge.dec();

        room.emit('playerLeft', {
          name: ws.playerName,
          playersCount: room.players.size,
        });

        appLogger.info(
          { event: 'playerLeft', roomId: room.id, playerName: ws.playerName, playersCount: room.players.size },
          'Player left room',
        );

        logger.write({
          type: 'playerLeft',
          timestamp: new Date().toISOString(),
          roomId: room.id,
          roomName: room.name,
          playerName: ws.playerName,
          playersCount: room.players.size,
        });

        if (room.players.size === 0) {
          roomManager.deleteRoom(room.id);
        }

        ws.room = null;
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const rawWs of wss.clients) {
      const ws = toClientSocket(rawWs);
      if (ws.missedPongs >= 2) {
        ws.terminate();
        continue;
      }

      ws.missedPongs += 1;
      ws.isAlive = false;
      ws.ping();
    }
  }, PING_INTERVAL);

  const rateLimitReset = setInterval(() => {
    for (const rawWs of wss.clients) {
      const ws = toClientSocket(rawWs);
      ws.messageCount = 0;
    }
  }, 1000);

  return {
    close(): void {
      clearInterval(heartbeat);
      clearInterval(rateLimitReset);

      const notice = JSON.stringify({
        type: 'shutdown',
        reason: 'Server is restarting for maintenance',
      });

      for (const ws of wss.clients) {
        if (ws.readyState === ws.OPEN) {
          try {
            sendTracked(ws, notice);
          } catch {
            // Ігноруємо помилку надсилання під час зупинки
          }
        }
        ws.close(1001, 'Server shutting down');
      }

      wss.close();
    },
  };
}
