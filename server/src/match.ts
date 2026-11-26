import { BotController } from './bot.js';
import {
  World,
  Ship,
  FIXED_DT,
  TICK_RATE,
  encodeMessage,
  asPlayerId,
  asSeq,
  type PlayerId,
  type Seq,
  type PlayerInput,
  type ShipInputLike,
  type MessageFormat,
} from 'shared';

const TICK_INTERVAL_MS = 1000 / TICK_RATE;
const RESPAWN_DELAY = 2.0;
const SPAWN_SHIELD_TIME = 2.5;
const MAX_INPUT_QUEUE = 20;

export interface MatchWebSocket {
  readonly readyState: number;
  readonly OPEN: number;
  send(data: string | ArrayBuffer): void;
}

export interface MatchStats {
  tickRate: number;
  totalTicks: number;
  lastDurationMs: number;
  avgDurationMs: number;
  jitterMs: number;
}

export interface MatchPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly ws: MatchWebSocket;
  ship: Ship | null;
  score: number;
  format: MessageFormat;
  inputQueue: PlayerInput[];
  lastInput: PlayerInput | null;
  lastProcessedSeq: Seq;
  respawnTimer: number;
}

export interface MatchOptions {
  width?: number;
  height?: number;
  asteroidCount?: number;
  seed?: number;
}

export class Match {
  readonly width: number;
  readonly height: number;
  readonly asteroidCount: number;
  readonly seed: number;
  readonly world: World;
  readonly players: Map<MatchWebSocket, MatchPlayer>;
  readonly bots: Map<PlayerId, { controller: BotController; respawnTimer: number }>;
  nextPlayerId: number;
  tick: number;
  running: boolean;
  timerId: ReturnType<typeof setTimeout> | null;
  nextTargetTime: number;
  lastStepStartTime: number;
  readonly stats: MatchStats;

  constructor({
    width = 800,
    height = 600,
    asteroidCount = 10,
    seed = Math.floor(Math.random() * 0x7fffffff) + 1,
  }: MatchOptions = {}) {
    this.width = width;
    this.height = height;
    this.asteroidCount = asteroidCount;
    this.seed = seed;

    this.world = new World({ width, height, seed });
    this.world.spawnAsteroids(asteroidCount);

    this.players = new Map();
    this.bots = new Map();
    this.nextPlayerId = 1;
    this.tick = 0;

    this.running = false;
    this.timerId = null;
    this.nextTargetTime = 0;
    this.lastStepStartTime = 0;

    this.stats = {
      tickRate: TICK_RATE,
      totalTicks: 0,
      lastDurationMs: 0,
      avgDurationMs: 0,
      jitterMs: 0,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextTargetTime = performance.now() + TICK_INTERVAL_MS;
    this.lastStepStartTime = performance.now();
    this.#scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  #scheduleNext(): void {
    if (!this.running) return;
    const now = performance.now();
    const delay = Math.max(0, this.nextTargetTime - now);
    this.timerId = setTimeout(() => this.#onTimer(), delay);
  }

  #onTimer(): void {
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

    this.nextTargetTime += TICK_INTERVAL_MS;
    if (this.nextTargetTime < stepEnd) {
      this.nextTargetTime = stepEnd + TICK_INTERVAL_MS;
    }

    this.#scheduleNext();
  }

  addPlayer(ws: MatchWebSocket, name: string, format: MessageFormat = 'binary'): MatchPlayer {
    const playerId = asPlayerId(this.nextPlayerId++);
    const ship = this.#spawnPlayerShip(playerId, name, 0);

    const player: MatchPlayer = {
      id: playerId,
      name,
      ws,
      ship,
      score: 0,
      format: format === 'json' ? 'json' : 'binary',
      inputQueue: [],
      lastInput: null,
      lastProcessedSeq: asSeq(0),
      respawnTimer: 0,
    };

    this.players.set(ws, player);
    return player;
  }

  getPlayer(ws: MatchWebSocket): MatchPlayer | null {
    return this.players.get(ws) ?? null;
  }

  setPlayerFormat(ws: MatchWebSocket, format: MessageFormat): void {
    const player = this.players.get(ws);
    if (!player) return;
    player.format = format === 'json' ? 'json' : 'binary';
  }

  addBot(name?: string): BotController {
    const botId = asPlayerId(this.nextPlayerId++);
    const botName = name ?? 'Bot-' + String(botId);
    const bot = new BotController(botId, botName);
    bot.ship = this.#spawnPlayerShip(botId, botName, 0);
    this.bots.set(botId, { controller: bot, respawnTimer: 0 });
    return bot;
  }

  removePlayer(ws: MatchWebSocket): void {
    const player = this.players.get(ws);
    if (!player) return;

    if (player.ship) {
      this.world.despawn(player.ship.id);
    }
    this.players.delete(ws);
  }

  enqueueInput(ws: MatchWebSocket, input: PlayerInput): void {
    const player = this.players.get(ws);
    if (!player) return;

    if (player.inputQueue.length >= MAX_INPUT_QUEUE) {
      player.inputQueue.shift();
    }
    player.inputQueue.push(input);
  }

  step(): void {
    this.tick += 1;

    for (const player of this.players.values()) {
      if (player.ship && player.ship.alive) {
        player.score = player.ship.score;

        let activeInput: ShipInputLike | null = null;
        if (player.inputQueue.length > 0) {
          const nextInput = player.inputQueue.shift()!;
          player.lastInput = nextInput;
          player.lastProcessedSeq = nextInput.seq;
          activeInput = nextInput;
        } else if (player.lastInput) {
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

    for (const entry of this.bots.values()) {
      const bot = entry.controller;
      if (bot.ship && bot.ship.alive) {
        const botInput = bot.decide(this.world, this.tick);
        const bullet = bot.ship.applyInput(botInput, FIXED_DT);
        if (bullet) {
          this.world.spawn(bullet);
        }
      } else {
        const prevScore = bot.ship?.score ?? 0;
        if (bot.ship) {
          bot.ship = null;
          entry.respawnTimer = RESPAWN_DELAY;
        }
        entry.respawnTimer -= FIXED_DT;
        if (entry.respawnTimer <= 0) {
          bot.ship = this.#spawnPlayerShip(bot.id, bot.name, prevScore);
        }
      }
    }

    this.world.step(FIXED_DT);

    let currentAsteroids = 0;
    for (const _ of this.world.ofKind('asteroid')) {
      currentAsteroids++;
    }
    const minAsteroids = Math.max(2, Math.floor(this.asteroidCount / 2));
    if (currentAsteroids < minAsteroids) {
      this.world.spawnAsteroids(this.asteroidCount - currentAsteroids);
    }

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

    if (this.players.size === 0) return;

    const entities = [...this.world].map((entity) => entity.toSnapshot());

    for (const player of this.players.values()) {
      if (player.ws.readyState !== player.ws.OPEN) continue;

      const snapshot = {
        type: 'snapshot' as const,
        tick: this.tick,
        lastProcessedSeq: player.lastProcessedSeq,
        yourShipId: player.ship?.id ?? 0,
        entities,
      };

      const encoded = encodeMessage(snapshot, player.format);
      player.ws.send(encoded);
    }
  }

  #spawnPlayerShip(playerId: PlayerId, name: string, score: number): Ship {
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


