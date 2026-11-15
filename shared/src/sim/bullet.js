import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Bullet extends Entity {
  constructor({
    id = null,
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 3,
    ttl = 2,
    damage = 1,
    ownerId = null,
  } = {}) {
    super({
      id,
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

  toSnapshot() {
    return {
      id: this.id,
      kind: 'bullet',
      x: this.pos.x,
      y: this.pos.y,
      vx: this.vel.x,
      vy: this.vel.y,
      angle: this.angle,
      radius: this.radius,
      ownerId: this.ownerId ?? 0,
    };
  }

  static fromSnapshot(data) {
    return new Bullet({
      id: data.id,
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx ?? 0, data.vy ?? 0),
      angle: data.angle ?? 0,
      radius: data.radius ?? 3,
      ownerId: data.ownerId ?? null,
    });
  }
}