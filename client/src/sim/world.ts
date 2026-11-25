import type { Entity, WorldLike } from './entity.js';
import { Bullet } from './bullet.js';
import { Vector2 } from './vector.js';
import { createExplosion } from './particle.js';
import { emitGameEvent } from '../events.js';

export interface WorldOptions {
  width?: number;
  height?: number;
}

interface Damageable {
  takeDamage(amount?: number): void;
}

function isDamageable(entity: Entity): entity is Entity & Damageable {
  return 'takeDamage' in entity && typeof entity.takeDamage === 'function';
}

export class World implements WorldLike {
  width: number;
  height: number;
  entities: Map<number, Entity>;

  constructor({ width = 800, height = 600 }: WorldOptions = {}) {
    this.width = width;
    this.height = height;
    this.entities = new Map();
  }

  spawn<T extends Entity>(entity: T): T {
    this.entities.set(entity.id, entity);
    return entity;
  }

  despawn(entityOrId: Entity | number): void {
    const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
    const entity = this.entities.get(id);

    if (entity) {
      entity.destroy();
      this.entities.delete(id);
    }
  }

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  [Symbol.iterator](): IterableIterator<Entity> {
    return this.entities.values();
  }

  *ofKind(kind: string): IterableIterator<Entity> {
    for (const entity of this.entities.values()) {
      if (entity.kind === kind && entity.alive) {
        yield entity;
      }
    }
  }

  step(dt: number): void {
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

  #checkCollisions(): void {
    const entities = [...this.entities.values()];

    for (const bullet of entities) {
      if (!bullet.alive || !(bullet instanceof Bullet)) continue;

      for (const target of entities) {
        if (
          bullet === target ||
          !bullet.alive ||
          !target.alive ||
          (target.kind !== 'asteroid' && target.kind !== 'ship')
        ) {
          continue;
        }

        const dx = Math.abs(bullet.pos.x - target.pos.x);
        const dy = Math.abs(bullet.pos.y - target.pos.y);

        const wrappedDx = Math.min(dx, this.width - dx);
        const wrappedDy = Math.min(dy, this.height - dy);
        const distance = Math.hypot(wrappedDx, wrappedDy);

        if (distance < bullet.radius + target.radius) {
          emitGameEvent('hit', { bullet, target });

          if (isDamageable(target)) {
            target.takeDamage(bullet.damage);

            if (target.kind === 'ship' && !target.alive) {
              emitGameEvent('exploded', { entity: target });

              for (const particle of createExplosion(target.pos, {
                count: 45,
                speed: 220,
                color: '#ff6a00',
              })) {
                this.spawn(particle);
              }
            }
          } else {
            target.destroy();

            if (target.kind === 'asteroid') {
              emitGameEvent('exploded', { entity: target });
            }
          }

          bullet.destroy();
          break;
        }
      }
    }
  }
}
