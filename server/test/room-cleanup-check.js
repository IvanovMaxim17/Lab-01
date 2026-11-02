import WebSocket from 'ws';

const response = await fetch('http://localhost:3000/api/rooms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'Cleanup Test' }),
});

const data = await response.json();
const roomId = data.room.id;

console.log('Created room:', roomId);

const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'join',
    roomId,
    name: 'Pilot',
  }));
});

ws.on('message', async (rawMessage) => {
  const message = JSON.parse(rawMessage.toString());

  if (message.type === 'joined') {
    console.log('Player joined. Closing connection...');
    ws.close();
  }
});

ws.on('close', async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));

  const roomsResponse = await fetch('http://localhost:3000/api/rooms');
  const roomsData = await roomsResponse.json();

  const roomExists = roomsData.rooms.some((room) => room.id === roomId);

  console.log('Room still exists:', roomExists);
  console.log(roomExists ? 'FAIL' : 'SUCCESS: empty room deleted');
});