import { performance } from 'node:perf_hooks';
import {
  World,
  Ship,
  FIXED_DT,
  TICK_RATE,
  encodeMessage,
} from 'shared';

const TICK_INTERVAL_MS = 1000 / TICK_RATE;
const RESPAWN_DELAY = 2.0;
const SPAWN_SHIELD_TIME = 2.5;
const MAX_INPUT_QUEUE = 20;

export class Match {
  constructor({
    width = 800,
    height = 600,
    asteroidCount = 10,
    seed = Math.floor(Math.random() * 0x7fffffff) + 1,
  } = {}) {
    this.width = width;
    this.height = height;
    this.asteroidCount = asteroidCount;
    this.seed = seed;

    this.world = new World({ width, height, seed });
    this.world.spawnAsteroids(asteroidCount);

    this.players = new Map(); // ws -> playerState
    this.nextPlayerId = 1;
    this.tick = 0;

    this.running = false;
    this.timerId = null;
    this.nextTargetTime = 0;
    this.lastStepStartTime = 0;

    // Метрики для /api/stats
    this.stats = {
      tickRate: TICK_RATE,
      totalTicks: 0,
      lastDurationMs: 0,
      avgDurationMs: 0,
      jitterMs: 0,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.nextTargetTime = performance.now() + TICK_INTERVAL_MS;
    this.lastStepStartTime = performance.now();
    this.#scheduleNext();
  }

  stop() {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  #scheduleNext() {
    if (!this.running) return;
    const now = performance.now();
    const delay = Math.max(0, this.nextTargetTime - now);
    this.timerId = setTimeout(() => this.#onTimer(), delay);
  }

  #onTimer() {
    if (!this.running) return;

    const stepStart = performance.now();
    const actualInterval = stepStart - this.lastStepStartTime;
    this.lastStepStartTime = stepStart;

    this.step();

    const stepEnd = performance.now();
    const durationMs = stepEnd - stepStart;
    const intervalError = Math.abs(actualInterval - TICK_INTERVAL_MS);

    this.stats.totalTicks += 1;
    this.stats.lastDurationMs = Number(durationMs.toFixed(3));
    this.stats.avgDurationMs = Number(
      (this.stats.avgDurationMs * 0.9 + durationMs * 0.1).toFixed(3),
    );
    this.stats.jitterMs = Number(
      (this.stats.jitterMs * 0.9 + intervalError * 0.1).toFixed(3),
    );

    // Плануємо наступний крок на фіксований цільовий час без накопичення дрейфу
    this.nextTargetTime += TICK_INTERVAL_MS;
    if (this.nextTargetTime < stepEnd) {
      this.nextTargetTime = stepEnd + TICK_INTERVAL_MS;
    }

    this.#scheduleNext();
  }

  addPlayer(ws, name, format = 'binary') {
    const playerId = this.nextPlayerId++;
    const ship = this.#spawnPlayerShip(playerId, name, 0);

    const player = {
      id: playerId,
      name,
      ws,
      ship,
      score: 0,
      format: format === 'json' ? 'json' : 'binary',
      inputQueue: [],
      lastInput: null,
      lastProcessedSeq: 0,
      respawnTimer: 0,
    };

    this.players.set(ws, player);
    return player;
  }

  getPlayer(ws) {
    return this.players.get(ws) ?? null;
  }

  setPlayerFormat(ws, format) {
    const player = this.players.get(ws);
    if (!player) return;
    player.format = format === 'json' ? 'json' : 'binary';
  }

  removePlayer(ws) {
    const player = this.players.get(ws);
    if (!player) return;

    if (player.ship) {
      this.world.despawn(player.ship.id);
    }
    this.players.delete(ws);
  }

  enqueueInput(ws, input) {
    const player = this.players.get(ws);
    if (!player) return;

    if (player.inputQueue.length >= MAX_INPUT_QUEUE) {
      player.inputQueue.shift();
    }
    player.inputQueue.push(input);
  }

  step() {
    this.tick += 1;

    // 1. Обробляємо чергу команд або таймер відродження кожного гравця
    for (const player of this.players.values()) {
      if (player.ship && player.ship.alive) {
        player.score = player.ship.score;

        let activeInput = null;
        if (player.inputQueue.length > 0) {
          activeInput = player.inputQueue.shift();
          player.lastInput = activeInput;
          player.lastProcessedSeq = activeInput.seq;
        } else if (player.lastInput) {
          // Якщо пакет затримався, утримуємо поворот/тягу без повторного пострілу
          activeInput = {
            turn: player.lastInput.turn,
            thrust: player.lastInput.thrust,
            fire: 0,
          };
        }

        if (activeInput) {
          const bullet = player.ship.applyInput(activeInput, FIXED_DT);
          if (bullet) {
            this.world.spawn(bullet);
          }
        }
      } else {
        if (player.ship) {
          player.score = player.ship.score;
          player.ship = null;
          player.respawnTimer = RESPAWN_DELAY;
        }

        player.respawnTimer -= FIXED_DT;
        if (player.respawnTimer <= 0) {
          player.ship = this.#spawnPlayerShip(player.id, player.name, player.score);
        }
      }
    }

    // 2. Оновлюємо симуляцію світу
    this.world.step(FIXED_DT);

    // 3. Поповнюємо астероїди, якщо їх стало менше половини від норми арени
    let currentAsteroids = 0;
    for (const _ of this.world.ofKind('asteroid')) {
      currentAsteroids++;
    }
    const minAsteroids = Math.max(2, Math.floor(this.asteroidCount / 2));
    if (currentAsteroids < minAsteroids) {
      this.world.spawnAsteroids(this.asteroidCount - currentAsteroids);
    }

    // 4. Розсилаємо події зіткнень (для частинок вибуху та звуку на клієнті)
    const events = this.world.drainEvents();
    if (events.length > 0) {
      const eventsPayload = JSON.stringify({
        type: 'events',
        tick: this.tick,
        events,
      });
      for (const player of this.players.values()) {
        if (player.ws.readyState === player.ws.OPEN) {
          player.ws.send(eventsPayload);
        }
      }
    }

    // 5. Формуємо та розсилаємо знімок світу кожному гравцю
    if (this.players.size === 0) return;

    const entities = [...this.world].map((entity) => entity.toSnapshot());

    for (const player of this.players.values()) {
      if (player.ws.readyState !== player.ws.OPEN) continue;

      const snapshot = {
        type: 'snapshot',
        tick: this.tick,
        lastProcessedSeq: player.lastProcessedSeq,
        yourShipId: player.ship?.id ?? 0,
        entities,
      };

      const encoded = encodeMessage(snapshot, player.format);
      player.ws.send(encoded);
    }
  }

  #spawnPlayerShip(playerId, name, score) {
    const pos = this.world.findSafeSpawnPosition(110);
    const ship = new Ship({
      playerId,
      name,
      pos,
      angle: this.world.prng.next() * Math.PI * 2,
      score,
      invulnerable: true,
      shieldTime: SPAWN_SHIELD_TIME,
    });
    return this.world.spawn(ship);
  }
}