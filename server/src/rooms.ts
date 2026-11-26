import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { Match, type MatchStats } from './match.js';
import { config } from './config.js';
import { activeRoomsGauge, rejectionsTotal } from './observability.js';

export interface ClientWebSocket extends WebSocket {
  isAlive: boolean;
  missedPongs: number;
  room: Room | null;
  playerName: string | null;
  messageCount: number;
  clientIp?: string;
}

export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly asteroidCount: number;
  readonly difficulty: string;
  readonly playersCount: number;
  readonly seed: number;
  readonly createdAt: string;
}

export interface RoomStats extends MatchStats {
  readonly roomId: string;
  readonly roomName: string;
  readonly playersCount: number;
  readonly tick: number;
}

export class Room extends EventEmitter {
  readonly id: string;
  readonly name: string;
  readonly asteroidCount: number;
  readonly difficulty: string;
  readonly players: Set<ClientWebSocket>;
  readonly createdAt: string;
  readonly match: Match;

  constructor(name: string, asteroidCount: number, difficulty: string) {
    super();

    this.id = randomUUID();
    this.name = name;
    this.asteroidCount = asteroidCount;
    this.difficulty = difficulty;
    this.players = new Set();
    this.createdAt = new Date().toISOString();

    this.match = new Match({
      width: 800,
      height: 600,
      asteroidCount,
    });
    this.match.start();
  }

  toJSON(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      asteroidCount: this.asteroidCount,
      difficulty: this.difficulty,
      playersCount: this.players.size,
      seed: this.match.seed,
      createdAt: this.createdAt,
    };
  }
}

export class RoomManager extends EventEmitter {
  readonly rooms: Map<string, Room>;

  constructor() {
    super();

    this.rooms = new Map();

    this.createRoom('Легка арена', 8, 'Легка');
    this.createRoom('Середня арена', 12, 'Середня');
    this.createRoom('Важка арена', 20, 'Важка');
  }

  createRoom(name: string, asteroidCount = 10, difficulty = 'Звичайна'): Room {
    const normalizedName = name.trim();

    if (!normalizedName || normalizedName.length > 30) {
      throw new Error('Room name must contain 1–30 characters');
    }

    if (this.rooms.size >= config.maxRooms) {
      rejectionsTotal.inc({ reason: 'max_rooms' });
      throw new Error(`Maximum rooms limit (${config.maxRooms}) reached`);
    }

    const room = new Room(normalizedName, asteroidCount, difficulty);

    this.rooms.set(room.id, room);
    activeRoomsGauge.set(this.rooms.size);
    this.emit('roomCreated', room);

    return room;
  }

  getRooms(): RoomSummary[] {
    return Array.from(this.rooms.values(), (room) => room.toJSON());
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  deleteRoom(id: string): boolean {
    const room = this.rooms.get(id);

    if (!room) {
      return false;
    }

    room.match.stop();
    this.rooms.delete(id);
    activeRoomsGauge.set(this.rooms.size);
    this.emit('roomDeleted', room);

    return true;
  }

  getStats(): RoomStats[] {
    return Array.from(this.rooms.values(), (room) => ({
      roomId: room.id,
      roomName: room.name,
      playersCount: room.players.size,
      tick: room.match.tick,
      ...room.match.stats,
    }));
  }

  closeAll(): void {
    for (const room of this.rooms.values()) {
      room.match.stop();
    }
    activeRoomsGauge.set(0);
  }
}
