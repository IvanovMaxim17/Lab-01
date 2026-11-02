import WebSocket from 'ws';

const response = await fetch('http://localhost:3000/api/rooms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Chat Test',
  }),
});

if (!response.ok) {
  throw new Error(`Не вдалося створити кімнату: HTTP ${response.status}`);
}

const data = await response.json();
const roomId = data.room.id;

console.log('Test room created:', roomId);

const players = [
  new WebSocket('ws://localhost:3000/ws'),
  new WebSocket('ws://localhost:3000/ws'),
];

let joinedCount = 0;
let chatReceived = false;

const timeout = setTimeout(() => {
  console.error('Test timeout: chat was not received');
  closePlayers();
}, 10000);

function closePlayers() {
  clearTimeout(timeout);

  for (const player of players) {
    if (
      player.readyState === WebSocket.OPEN ||
      player.readyState === WebSocket.CONNECTING
    ) {
      player.close();
    }
  }
}

players.forEach((player, index) => {
  player.on('open', () => {
    console.log(`Player ${index + 1} connected`);

    player.send(
      JSON.stringify({
        type: 'join',
        roomId,
        name: `Pilot ${index + 1}`,
      }),
    );
  });

  player.on('message', (rawMessage) => {
    const message = JSON.parse(rawMessage.toString());

    console.log(`Player ${index + 1} received:`, message);

    if (message.type === 'joined') {
      joinedCount += 1;

      if (joinedCount === 2) {
        console.log('Both players joined. Sending chat message...');

        players[0].send(
          JSON.stringify({
            type: 'chat',
            text: 'Hello from Pilot 1!',
          }),
        );
      }
    }

    if (
      index === 1 &&
      message.type === 'chat' &&
      message.text === 'Hello from Pilot 1!'
    ) {
      chatReceived = true;
      console.log('SUCCESS: chat message delivered to Player 2');
      closePlayers();
    }
  });

  player.on('error', (error) => {
    console.error(`Player ${index + 1} error:`, error.message);
  });
});