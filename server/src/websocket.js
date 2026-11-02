
import { WebSocketServer } from 'ws';

const MAX_MESSAGE_SIZE = 16 * 1024;
const JOIN_TIMEOUT = 5000;
const PING_INTERVAL = 15000;
const MAX_MESSAGES_PER_SECOND = 10;

export function attachWebSocket(server, roomManager, logger) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_SIZE,
  });

  server.on('upgrade', (request, socket, head) => {
    let url;

    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (ws) => {
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

    ws.on('message', (rawMessage) => {
      ws.messageCount += 1;

      if (ws.messageCount > MAX_MESSAGES_PER_SECOND) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      let message;

      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        ws.close(1007, 'Invalid JSON');
        return;
      }

      if (
        !message ||
        typeof message !== 'object' ||
        Array.isArray(message)
      ) {
        ws.close(1008, 'Invalid message');
        return;
      }

      if (message.type === 'join') {
        if (ws.room) {
          ws.close(1008, 'Already joined');
          return;
        }

        if (
          typeof message.roomId !== 'string' ||
          typeof message.name !== 'string'
        ) {
          ws.close(1008, 'Invalid join message');
          return;
        }

        const name = message.name.trim();
        const room = roomManager.getRoom(message.roomId);

        if (!name || name.length > 20 || !room) {
          ws.close(1008, 'Invalid room or player name');
          return;
        }

        clearTimeout(joinTimer);

        ws.room = room;
        ws.playerName = name;
        room.players.add(ws);

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
          ws.send(JSON.stringify({
            type: 'joined',
            room: room.toJSON(),
            playerName: name,
          }));
        }

        return;
      }

      if (message.type === 'chat') {
        if (
          !ws.room ||
          typeof message.text !== 'string' ||
          !message.text.trim() ||
          message.text.length > 500
        ) {
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

      ws.close(1008, 'Unknown message type');
    });

    ws.on('close', () => {
      clearTimeout(joinTimer);

      if (ws.room) {
        const room = ws.room;

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
    for (const ws of wss.clients) {
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
    for (const ws of wss.clients) {
      ws.messageCount = 0;
    }
  }, 1000);

  return {
    close() {
      clearInterval(heartbeat);
      clearInterval(rateLimitReset);

      for (const ws of wss.clients) {
        ws.close(1001, 'Server shutting down');
      }

      wss.close();
    },
  };
}
