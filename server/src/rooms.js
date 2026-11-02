
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export class Room extends EventEmitter {
  constructor(name, asteroidCount, difficulty) {
    super();

    this.id = randomUUID();
    this.name = name;
    this.asteroidCount = asteroidCount;
    this.difficulty = difficulty;
    this.players = new Set();
    this.createdAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      asteroidCount: this.asteroidCount,
      difficulty: this.difficulty,
      playersCount: this.players.size,
      createdAt: this.createdAt,
    };
  }
}

export class RoomManager extends EventEmitter {
  constructor() {
    super();

    this.rooms = new Map();

    this.createRoom('Легка арена', 8, 'Легка');
    this.createRoom('Середня арена', 12, 'Середня');
    this.createRoom('Важка арена', 20, 'Важка');
  }

  createRoom(name, asteroidCount = 10, difficulty = 'Звичайна') {
    const normalizedName = name.trim();

    if (!normalizedName || normalizedName.length > 30) {
      throw new Error('Room name must contain 1–30 characters');
    }

    const room = new Room(
      normalizedName,
      asteroidCount,
      difficulty,
    );

    this.rooms.set(room.id, room);
    this.emit('roomCreated', room);

    return room;
  }

  getRooms() {
    return Array.from(this.rooms.values(), (room) => room.toJSON());
  }

  getRoom(id) {
    return this.rooms.get(id);
  }

  deleteRoom(id) {
    const room = this.rooms.get(id);

    if (!room) {
      return false;
    }

    this.rooms.delete(id);
    this.emit('roomDeleted', room);

    return true;
  }
}
