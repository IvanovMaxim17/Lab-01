import { describe, it, expect, vi, afterEach } from 'vitest';
import { Match } from '../src/match.js';
import { RoomManager } from '../src/rooms.js';
import { asSeq, asTick } from 'shared';

function createMockSocket() {
  const sent: (string | ArrayBuffer)[] = [];
  return {
    readyState: 1,
    OPEN: 1,
    sent,
    send(data: string | ArrayBuffer) {
      sent.push(data);
    },
  };
}

describe('Server Match & RoomManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('RoomManager створює, повертає та видаляє кімнати з валідацією імені', () => {
    const manager = new RoomManager();
    expect(manager.getRooms().length).toBeGreaterThanOrEqual(3);

    const created = manager.createRoom('Тест-арена', 6, 'Легка');
    expect(manager.getRoom(created.id)?.name).toBe('Тест-арена');
    expect(manager.deleteRoom(created.id)).toBe(true);
    expect(() => manager.createRoom('   ')).toThrow();
    manager.closeAll();
  });

  it('Match обробляє вхід гравця, команди та розсилає знімки', () => {
    const match = new Match({ asteroidCount: 4, seed: 101 });
    const ws = createMockSocket();
    const player = match.addPlayer(ws, 'Pilot1', 'json');
    expect(player.ship).not.toBeNull();

    match.enqueueInput(ws, { seq: asSeq(1), tick: asTick(1), turn: 1, thrust: 1, fire: 0 });
    match.step();

    expect(ws.sent.length).toBeGreaterThan(0);
    const last = JSON.parse(String(ws.sent.at(-1))) as { type: string; lastProcessedSeq: number };
    expect(last.type).toBe('snapshot');
    expect(last.lastProcessedSeq).toBe(1);
  });

  it('Match виконує 30 тіків за 1 секунду під vi.useFakeTimers()', () => {
    vi.useFakeTimers();
    const match = new Match({ asteroidCount: 2, seed: 55 });
    match.start();
    vi.advanceTimersByTime(1000);
    match.stop();
    expect(match.tick).toBeGreaterThanOrEqual(29);
    expect(match.tick).toBeLessThanOrEqual(31);
  });

  it('Match відроджує знищений корабель після RESPAWN_DELAY', () => {
    const match = new Match({ asteroidCount: 0, seed: 55 });
    const ws = createMockSocket();
    const player = match.addPlayer(ws, 'Phoenix', 'binary');
    player.ship?.destroy();

    for (let i = 0; i < 70; i++) {
      match.step();
    }
    expect(player.ship).not.toBeNull();
    expect(player.ship?.alive).toBe(true);
  });
});

describe('Server Bots & Rate Limiting', () => {
  it('BotController генерує валідний PlayerInput та керує кораблем у Match', () => {
    const match = new Match({ asteroidCount: 5, seed: 303 });
    const bot = match.addBot('AlphaBot');
    expect(bot.ship).not.toBeNull();
    expect(match.bots.size).toBe(1);

    for (let i = 0; i < 30; i++) {
      match.step();
    }
    expect(bot.ship).not.toBeNull();
  });

  it('Match відроджує знищеного бота через RESPAWN_DELAY', () => {
    const match = new Match({ asteroidCount: 0, seed: 404 });
    const bot = match.addBot('RespawnBot');
    bot.ship?.destroy();

    for (let i = 0; i < 70; i++) {
      match.step();
    }
    expect(bot.ship).not.toBeNull();
    expect(bot.ship?.alive).toBe(true);
  });

  it('enqueueInput обмежує розмір черги команд до MAX_INPUT_QUEUE', () => {
    const match = new Match({ asteroidCount: 0, seed: 505 });
    const ws = createMockSocket();
    const player = match.addPlayer(ws, 'Spammer', 'binary');
    for (let s = 1; s <= 30; s++) {
      match.enqueueInput(ws, { seq: asSeq(s), tick: asTick(s), turn: 0, thrust: 0, fire: 0 });
    }
    expect(player.inputQueue.length).toBeLessThanOrEqual(20);
  });
});

describe('Server Match extended lifecycle & stats', () => {
  it('Match.getPlayer, setPlayerFormat та removePlayer коректно оновлюють стан', () => {
    const match = new Match({ asteroidCount: 2, seed: 606 });
    const ws = createMockSocket();
    const p = match.addPlayer(ws, 'Navigator', 'binary');
    expect(match.getPlayer(ws)?.id).toBe(p.id);

    match.setPlayerFormat(ws, 'json');
    expect(match.getPlayer(ws)?.format).toBe('json');

    const shipId = p.ship!.id;
    match.removePlayer(ws);
    expect(match.getPlayer(ws)).toBeNull();
    expect(match.world.get(shipId)).toBeUndefined();
  });

  it('Match автоматично поповнює астероїди, коли їх кількість падає нижче половини', () => {
    const match = new Match({ asteroidCount: 6, seed: 707 });
    for (const ast of [...match.world.ofKind('asteroid')]) {
      match.world.despawn(ast.id);
    }
    match.step();
    const count = [...match.world.ofKind('asteroid')].length;
    expect(count).toBe(6);
  });

  it('Match розсилає подію events клієнтам при влучанні кулі', () => {
    const match = new Match({ asteroidCount: 0, seed: 808 });
    const ws = createMockSocket();
    match.addPlayer(ws, 'Gunner', 'json');
    match.world.events.push({
      type: 'exploded',
      entityId: 99 as never,
      kind: 'asteroid',
      x: 100,
      y: 100,
    });
    match.step();
    const hasEventsMsg = ws.sent.some((raw) => String(raw).includes('"type":"events"'));
    expect(hasEventsMsg).toBe(true);
  });

  it('RoomManager.getStats повертає метрики по всіх активних кімнатах', () => {
    const manager = new RoomManager();
    const stats = manager.getStats();
    expect(stats.length).toBeGreaterThanOrEqual(3);
    expect(stats[0]?.tickRate).toBe(30);
    manager.closeAll();
  });
});
