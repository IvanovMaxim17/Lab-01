
import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Particle extends Entity {
  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    radius = 3,
    ttl = 0.6,
    color = '#ffffff',
  } = {}) {
    super({
      pos,
      vel,
      radius,
      kind: 'particle',
    });

    this.ttl = ttl;
    this.maxTtl = ttl;
    this.color = color;
  }

  update(dt, world) {
    super.update(dt, world);

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  get alpha() {
    return Math.max(0, this.ttl / this.maxTtl);
  }
}

export function createExplosion(pos, {
  count = 12,
  speed = 120,
  color = '#ff9933',
} = {}) {
  const particles = [];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = Vector2.fromAngle(angle).scale(
      Math.random() * speed,
    );

    particles.push(
      new Particle({
        pos: new Vector2(pos.x, pos.y),
        vel: velocity,
        radius: 2 + Math.random() * 3,
        ttl: 0.3 + Math.random() * 0.7,
        color,
      }),
    );
  }

  return particles;
}
