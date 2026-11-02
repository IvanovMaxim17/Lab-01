
import { Vector2 } from './vector.js';
import { createExplosion } from './particle.js';
import { emitGameEvent } from '../events.js';

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

      // РљРѕСЂР°Р±РµР»СЊ С– РєСѓР»С– РїРµСЂРµС…РѕРґСЏС‚СЊ С‡РµСЂРµР· РєСЂР°С— РµРєСЂР°РЅР°.
      if (entity.kind === 'ship' || entity.kind === 'bullet') {
        const x = ((entity.pos.x % this.width) + this.width) % this.width;
        const y = ((entity.pos.y % this.height) + this.height) % this.height;

        entity.pos = new Vector2(x, y);
      }
    }

    this.#checkCollisions();

    // Р’РёРґР°Р»СЏС”РјРѕ Р·РЅРёС‰РµРЅС– СЃСѓС‚РЅРѕСЃС‚С– РїС–СЃР»СЏ РїРµСЂРµРІС–СЂРєРё Р·С–С‚РєРЅРµРЅСЊ.
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

        // Р’Р»Р°СЃРЅРёРє РєСѓР»С– С‚Р°РєРѕР¶ РјРѕР¶Рµ РѕС‚СЂРёРјР°С‚Рё С€РєРѕРґСѓ!
        const dx = Math.abs(bullet.pos.x - target.pos.x);
        const dy = Math.abs(bullet.pos.y - target.pos.y);

        // Р’СЂР°С…РѕРІСѓС”РјРѕ Р±Р»РёР·СЊРєС–СЃС‚СЊ РѕР±'С”РєС‚С–РІ С‡РµСЂРµР· РєСЂР°С— РµРєСЂР°РЅР°.
        const wrappedDx = Math.min(dx, this.width - dx);
        const wrappedDy = Math.min(dy, this.height - dy);

        const distance = Math.hypot(wrappedDx, wrappedDy);

        if (distance < bullet.radius + target.radius) {
          emitGameEvent('hit', { bullet, target });

          if (typeof target.takeDamage === 'function') {
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

