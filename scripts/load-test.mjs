import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { encodeBinary } from '../shared/dist/index.js';

const PORT = 3099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;
const LEVELS = [8, 32, 64, 128];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Server failed to start for load test');
}

async function runLevel(clientCount) {
  const roomRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Load-${clientCount}` }),
  });
  const { room } = await roomRes.json();

  const clients = [];
  let bytesReceived = 0;

  for (let i = 0; i < clientCount; i++) {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.on('message', (data) => {
      bytesReceived += Buffer.isBuffer(data) ? data.byteLength : Buffer.byteLength(String(data));
    });
    ws.send(JSON.stringify({ type: 'join', roomId: room.id, name: `BotLoad${i}`, format: 'binary' }));
    clients.push(ws);
  }

  await sleep(300);
  const start = performance.now();
  let seq = 1;
  const sender = setInterval(() => {
    const pkt = encodeBinary({
      type: 'input',
      seq: seq++,
      tick: seq,
      turn: (seq % 3) - 1,
      thrust: 1,
      fire: seq % 5 === 0 ? 1 : 0,
    });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pkt);
      }
    }
  }, 33);

  await sleep(3000);
  clearInterval(sender);
  const elapsedSec = (performance.now() - start) / 1000;

  const statsRes = await fetch(`${BASE_URL}/api/stats`);
  const stats = await statsRes.json();
  const roomStat = stats.rooms.find((r) => r.roomId === room.id) ?? stats.rooms[0];

  for (const ws of clients) {
    ws.close();
  }
  await sleep(250);

  return {
    clients: clientCount,
    avgTickMs: roomStat?.avgDurationMs ?? 0,
    lastTickMs: roomStat?.lastDurationMs ?? 0,
    jitterMs: roomStat?.jitterMs ?? 0,
    elu: stats.eventLoopUtilization ?? 0,
    rssMb: Number(((stats.rssBytes ?? 0) / (1024 * 1024)).toFixed(1)),
    kbPerSec: Number((bytesReceived / 1024 / elapsedSec).toFixed(1)),
  };
}

const serverProc = spawn(process.execPath, ['server/dist/index.js'], {
  env: { ...process.env, PORT: String(PORT), LOG_DIR: './logs-loadtest' },
  stdio: 'ignore',
});

try {
  await waitForHealth();
  const results = [];
  for (const n of LEVELS) {
    results.push(await runLevel(n));
  }
  console.log('\n=== LOAD TEST RESULTS (33.3 ms tick budget) ===');
  console.table(results);
} finally {
  serverProc.kill('SIGTERM');
}
