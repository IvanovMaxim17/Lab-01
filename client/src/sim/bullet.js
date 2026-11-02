
import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Bullet extends Entity {
  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 3,
    ttl = 2,
    damage = 1,
    ownerId = null,
  } = {}) {
    super({
      pos,
      vel,
      angle,
      radius,
      kind: 'bullet',
    });

    this.ttl = ttl;
    this.damage = damage;
    this.ownerId = ownerId;
  }

  update(dt, world) {
    super.update(dt, world);

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }
}
