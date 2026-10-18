
import { Vector2 } from './vector.js';
import { createExplosion } from './particle.js';

export class World {
  constructor({ width = 800, height = 600 } = {}) {
    this.width = width;
    this.height = height;
    this.entities = new Map();
  }

  spawn(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  despawn(entityOrId) {
    const id =
      typeof entityOrId === 'number'
        ? entityOrId
        : entityOrId.id;

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

  step(dt) {
    for (const entity of [...this.entities.values()]) {
      if (!entity.alive) continue;

      entity.update(dt, this);

      // Корабель і кулі переходять через краї екрана.
      if (entity.kind === 'ship' || entity.kind === 'bullet') {
        const x = ((entity.pos.x % this.width) + this.width) % this.width;
        const y = ((entity.pos.y % this.height) + this.height) % this.height;

        entity.pos = new Vector2(x, y);
      }
    }

    this.#checkCollisions();

    // Видаляємо знищені сутності після перевірки зіткнень.
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

        // Власник кулі також може отримати шкоду!
        const dx = Math.abs(bullet.pos.x - target.pos.x);
        const dy = Math.abs(bullet.pos.y - target.pos.y);

        // Враховуємо близькість об'єктів через краї екрана.
        const wrappedDx = Math.min(dx, this.width - dx);
        const wrappedDy = Math.min(dy, this.height - dy);

        const distance = Math.hypot(wrappedDx, wrappedDy);

        if (distance < bullet.radius + target.radius) {
          if (typeof target.takeDamage === 'function') {
            target.takeDamage(bullet.damage);

            // Вибух створюється, коли корабель знищено.
            if (target.kind === 'ship' && !target.alive) {
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
          }

          bullet.destroy();
          break;
        }
      }
    }
  }
}
