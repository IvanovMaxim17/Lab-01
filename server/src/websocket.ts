import type { Server } from 'node:http';
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

const MAX_MESSAGE_SIZE = 16 * 1024;
const JOIN_TIMEOUT = 5000;
const PING_INTERVAL = 15000;
const MAX_MESSAGES_PER_SECOND = 120;

function toClientSocket(ws: WebSocket): ClientWebSocket {
  // Розширюємо екземпляр ws.WebSocket полями ігрової сесії
  return ws as ClientWebSocket;
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

  server.on('upgrade', (request, socket, head) => {
    let url: URL;

    try {
      url = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (rawWs: WebSocket) => {
    const ws = toClientSocket(rawWs);
    ws.isAlive = true;
    ws.missedPongs = 0;
    ws.room = null;
    ws.playerName = null;
    ws.messageCount = 0;

    const joinTimer = setTimeout(() => {
      if (!ws.room && ws.readyState === ws.OPEN) {
        ws.close(1008, 'Join timeout');
      }
    }, JOIN_TIMEOUT);

    ws.on('pong', () => {
      ws.isAlive = true;
      ws.missedPongs = 0;
    });

    ws.on('message', (rawMessage: RawData, isBinary: boolean) => {
      ws.messageCount += 1;

      if (ws.messageCount > MAX_MESSAGES_PER_SECOND) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      if (isBinary) {
        let binaryMessage;
        try {
          binaryMessage = decodeMessage(rawDataToBuffer(rawMessage));
        } catch {
          ws.close(1007, 'Invalid binary frame');
          return;
        }

        if (binaryMessage.type === 'input') {
          if (!ws.room) {
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
            ws.send(pongPayload);
          }
          return;
        }

        ws.close(1008, 'Unknown binary message type');
        return;
      }

      let rawJson: unknown;
      try {
        rawJson = JSON.parse(rawMessage.toString());
      } catch {
        ws.close(1007, 'Invalid JSON');
        return;
      }

      if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
        ws.close(1008, 'Invalid message');
        return;
      }

      const parsed = ClientJsonMessageSchema.safeParse(rawJson);
      if (!parsed.success) {
        const rawType = typeof rawJson === 'object' && rawJson !== null && 'type' in rawJson ? rawJson.type : undefined;
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
          ws.close(1008, 'Already joined');
          return;
        }

        const name = message.name.trim();
        const room = roomManager.getRoom(message.roomId);

        if (!name || name.length > 20 || !room) {
          ws.close(1008, 'Invalid room or player name');
          return;
        }

        clearTimeout(joinTimer);

        const format = message.format === 'json' ? 'json' : 'binary';
        ws.room = room;
        ws.playerName = name;
        room.players.add(ws);

        const player = room.match.addPlayer(ws, name, format);

        room.emit('playerJoined', {
          name,
          playersCount: room.players.size,
        });

        logger.write({
          type: 'playerJoined',
          timestamp: new Date().toISOString(),
          roomId: room.id,
          roomName: room.name,
          playerName: name,
          playersCount: room.players.size,
        });

        if (ws.readyState === ws.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'joined',
              room: room.toJSON(),
              playerName: name,
              playerId: player.id,
              shipId: player.ship?.id ?? 0,
              tickRate: TICK_RATE,
              format: player.format,
            }),
          );
        }

        return;
      }

      if (message.type === 'input') {
        if (!ws.room) {
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
          ws.send(pongPayload);
        }
        return;
      }

      if (message.type === 'format') {
        if (!ws.room) return;
        const nextFormat = message.format === 'json' ? 'json' : 'binary';
        ws.room.match.setPlayerFormat(ws, nextFormat);

        if (ws.readyState === ws.OPEN) {
          ws.send(
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

        for (const player of ws.room.players) {
          if (
            player.readyState === player.OPEN &&
            player.bufferedAmount < 64 * 1024
          ) {
            player.send(JSON.stringify(chatMessage));
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

      if (ws.room) {
        const room = ws.room;

        room.match.removePlayer(ws);
        room.players.delete(ws);

        room.emit('playerLeft', {
          name: ws.playerName,
          playersCount: room.players.size,
        });

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

      for (const ws of wss.clients) {
        ws.close(1001, 'Server shutting down');
      }

      wss.close();
    },
  };
}


