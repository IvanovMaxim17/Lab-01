import { Vector2 } from './vector.js';
import { Asteroid } from './asteroid.js';
import { createPrng } from '../prng.js';

export const TICK_RATE = 30;
export const FIXED_DT = 1 / TICK_RATE;

export class World {
  constructor({ width = 800, height = 600, seed = 12345 } = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.prng = createPrng(seed);
    this.entities = new Map();
    this.events = [];
  }

  spawn(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  despawn(entityOrId) {
    const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
    const entity = this.entities.get(id);

    if (entity) {
      entity.destroy();
      this.entities.delete(id);
    }
  }

  get(id) {
    return this.entities.get(id);
  }

  [Symbol.iterator]() {
    return this.entities.values();
  }

  *ofKind(kind) {
    for (const entity of this.entities.values()) {
      if (entity.kind === kind && entity.alive) {
        yield entity;
      }
    }
  }

  spawnAsteroids(count) {
    const margin = 40;

    for (let i = 0; i < count; i++) {
      const pos = new Vector2(
        margin + this.prng.next() * Math.max(1, this.width - margin * 2),
        margin + this.prng.next() * Math.max(1, this.height - margin * 2),
      );
      const angle = this.prng.next() * Math.PI * 2;
      const speed = 30 + this.prng.next() * 60;
      const radius = 18 + this.prng.next() * 16;

      this.spawn(
        new Asteroid({
          pos,
          vel: Vector2.fromAngle(angle).scale(speed),
          radius,
        }),
      );
    }
  }

  findSafeSpawnPosition(safeDistance = 100) {
    const margin = 50;

    for (let attempt = 0; attempt < 30; attempt++) {
      const pos = new Vector2(
        margin + this.prng.next() * Math.max(1, this.width - margin * 2),
        margin + this.prng.next() * Math.max(1, this.height - margin * 2),
      );

      const safe = [...this.entities.values()].every((entity) => {
        if (!entity.alive || (entity.kind !== 'asteroid' && entity.kind !== 'ship')) {
          return true;
        }
        return entity.pos.sub(pos).length() >= entity.radius + safeDistance;
      });

      if (safe) return pos;
    }

    return new Vector2(this.width / 2, this.height / 2);
  }

  drainEvents() {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  step(dt = FIXED_DT) {
    for (const entity of [...this.entities.values()]) {
      if (!entity.alive) continue;

      entity.update(dt, this);

      if (entity.kind === 'ship' || entity.kind === 'bullet') {
        const x = ((entity.pos.x % this.width) + this.width) % this.width;
        const y = ((entity.pos.y % this.height) + this.height) % this.height;
        entity.pos = new Vector2(x, y);
      }
    }

    this.#checkCollisions();

    for (const [id, entity] of this.entities) {
      if (!entity.alive) {
        this.entities.delete(id);
      }
    }
  }

  #checkCollisions() {
    const entities = [...this.entities.values()];

    for (const bullet of entities) {
      if (!bullet.alive || bullet.kind !== 'bullet') continue;

      for (const target of entities) {
        if (
          bullet === target ||
          !bullet.alive ||
          !target.alive ||
          (target.kind !== 'asteroid' && target.kind !== 'ship')
        ) {
          continue;
        }

        // Куля не влучає в корабель, який її випустив у момент пострілу
        if (target.kind === 'ship' && target.id === bullet.ownerId && bullet.ttl > 1.85) {
          continue;
        }

        const dx = Math.abs(bullet.pos.x - target.pos.x);
        const dy = Math.abs(bullet.pos.y - target.pos.y);

        const wrappedDx = Math.min(dx, this.width - dx);
        const wrappedDy = Math.min(dy, this.height - dy);
        const distance = Math.hypot(wrappedDx, wrappedDy);

        if (distance < bullet.radius + target.radius) {
          this.events.push({
            type: 'hit',
            bulletId: bullet.id,
            targetId: target.id,
            targetKind: target.kind,
            x: target.pos.x,
            y: target.pos.y,
          });

          const shooter = this.get(bullet.ownerId);

          if (typeof target.takeDamage === 'function') {
            target.takeDamage(bullet.damage);

            if (!target.alive) {
              if (shooter && shooter.kind === 'ship' && shooter.id !== target.id) {
                shooter.score += 100;
              }
              this.events.push({
                type: 'exploded',
                entityId: target.id,
                kind: target.kind,
                x: target.pos.x,
                y: target.pos.y,
              });
            }
          } else {
            target.destroy();
            if (shooter && shooter.kind === 'ship') {
              shooter.score += 25;
            }
            this.events.push({
              type: 'exploded',
              entityId: target.id,
              kind: target.kind,
              x: target.pos.x,
              y: target.pos.y,
            });
          }

          bullet.destroy();
          break;
        }
      }
    }
  }
}