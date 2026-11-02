import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/ws');

const startedAt = Date.now();

ws.on('open', () => {
  console.log('Connected without joining a room...');
});

ws.on('close', (code, reason) => {
  const elapsed = Date.now() - startedAt;

  console.log('Connection closed');
  console.log('Close code:', code);
  console.log('Reason:', reason.toString());
  console.log('Elapsed:', `${elapsed} ms`);

  if (code === 1008 && elapsed >= 4500 && elapsed <= 7000) {
    console.log('SUCCESS: 5-second join timeout works');
  } else {
    console.log('FAIL: unexpected timeout result');
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error.message);
});