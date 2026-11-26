import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';

const PORT = 3108;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // Чекаємо запуску процесу
    }
    await sleep(150);
  }
  throw new Error('Production test server did not start in time');
}

describe('Production server endpoints, security & graceful shutdown', () => {
  let proc: ChildProcess | null = null;

  afterAll(() => {
    if (proc && !proc.killed) {
      proc.kill('SIGKILL');
    }
  });

  it('запускається з конфігурацією через ENV та відповідає на /health, /ready, /metrics і PWA-асети', async () => {
    proc = spawn(process.execPath, ['server/dist/index.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(PORT),
        HOST: '127.0.0.1',
        LOG_LEVEL: 'silent',
        LOG_DIR: './logs-loadtest',
        APP_VERSION: 'v1.0.0-verify',
        ALLOWED_ORIGINS: 'http://127.0.0.1:3108',
        MAX_CONNECTIONS_PER_IP: '2',
      },
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    await waitForServer();

    const healthRes = await fetch(`${BASE_URL}/health`);
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as { status: string; version: string };
    expect(health.status).toBe('ok');
    expect(health.version).toBe('v1.0.0-verify');

    const readyRes = await fetch(`${BASE_URL}/ready`);
    expect(readyRes.status).toBe(200);
    const ready = (await readyRes.json()) as { status: string; rooms: number };
    expect(ready.status).toBe('ready');
    expect(ready.rooms).toBeGreaterThanOrEqual(3);

    const metricsRes = await fetch(`${BASE_URL}/metrics`);
    expect(metricsRes.status).toBe(200);
    const metricsText = await metricsRes.text();
    expect(metricsText).toContain('spacefight_active_players');
    expect(metricsText).toContain('spacefight_ws_messages_total');

    const manifestRes = await fetch(`${BASE_URL}/manifest.webmanifest`);
    expect(manifestRes.status).toBe(200);
    const swRes = await fetch(`${BASE_URL}/sw.js`);
    expect(swRes.status).toBe(200);
  });

  it('відхиляє WebSocket-підключення з недозволеним Origin (403)', async () => {
    const statusCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(WS_URL, { headers: { Origin: 'http://evil.example.com' } });
      ws.once('unexpected-response', (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
      ws.once('open', () => {
        ws.close();
        resolve(200);
      });
      ws.once('error', () => {
        // Очікувана помилка при 403
      });
    });

    expect(statusCode).toBe(403);
  });

  it('обмежує кількість одночасних WebSocket-зʼєднань з одного IP (429) та коректно завершується (1001)', async () => {
    const ws1 = new WebSocket(WS_URL, { headers: { Origin: 'http://127.0.0.1:3108' } });
    const ws2 = new WebSocket(WS_URL, { headers: { Origin: 'http://127.0.0.1:3108' } });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        ws1.once('open', () => resolve());
        ws1.once('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        ws2.once('open', () => resolve());
        ws2.once('error', reject);
      }),
    ]);

    const thirdStatus = await new Promise<number>((resolve) => {
      const ws3 = new WebSocket(WS_URL, { headers: { Origin: 'http://127.0.0.1:3108' } });
      ws3.once('unexpected-response', (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
      ws3.once('open', () => {
        ws3.close();
        resolve(200);
      });
      ws3.once('error', () => {});
    });

    expect(thirdStatus).toBe(429);

    const closeEvent = new Promise<{ code: number; sawNotice: boolean }>((resolve) => {
      let sawNotice = false;
      ws1.on('message', (data) => {
        if (String(data).includes('"type":"shutdown"')) {
          sawNotice = true;
        }
      });
      ws1.once('close', (code) => {
        resolve({ code, sawNotice });
      });
    });

    if (process.platform === 'win32') {
      proc?.stdin?.write('SIGTERM\n');
    } else {
      proc?.kill('SIGTERM');
    }

    const closed = await closeEvent;
    expect(closed.code).toBe(1001);
    expect(closed.sawNotice).toBe(true);
    ws2.terminate();
  });
});
