import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Asteroid extends Entity {
  constructor({
    id = null,
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 20,
    size = 3,
  } = {}) {
    super({
      id,
      pos,
      vel,
      angle,
      radius,
      kind: 'asteroid',
    });

    this.size = size;
  }

  update(dt, world) {
    super.update(dt, world);

    if (!world) return;

    const width = world.width;
    const height = world.height;

    if (this.pos.x - this.radius < 0) {
      this.pos = new Vector2(this.radius, this.pos.y);
      this.vel = new Vector2(Math.abs(this.vel.x), this.vel.y);
    } else if (this.pos.x + this.radius > width) {
      this.pos = new Vector2(width - this.radius, this.pos.y);
      this.vel = new Vector2(-Math.abs(this.vel.x), this.vel.y);
    }

    if (this.pos.y - this.radius < 0) {
      this.pos = new Vector2(this.pos.x, this.radius);
      this.vel = new Vector2(this.vel.x, Math.abs(this.vel.y));
    } else if (this.pos.y + this.radius > height) {
      this.pos = new Vector2(this.pos.x, height - this.radius);
      this.vel = new Vector2(this.vel.x, -Math.abs(this.vel.y));
    }
  }

  toSnapshot() {
    return {
      id: this.id,
      kind: 'asteroid',
      x: this.pos.x,
      y: this.pos.y,
      vx: this.vel.x,
      vy: this.vel.y,
      angle: this.angle,
      radius: this.radius,
    };
  }

  static fromSnapshot(data) {
    return new Asteroid({
      id: data.id,
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx ?? 0, data.vy ?? 0),
      angle: data.angle ?? 0,
      radius: data.radius ?? 20,
    });
  }
}
