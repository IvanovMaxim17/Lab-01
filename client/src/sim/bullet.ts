import { Entity, type EntityOptions, type WorldLike } from './entity.js';
import { Vector2 } from './vector.js';

export interface BulletOptions extends Omit<EntityOptions, 'kind'> {
  ttl?: number;
  damage?: number;
  ownerId?: number | null;
}

export class Bullet extends Entity {
  ttl: number;
  damage: number;
  ownerId: number | null;

  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 3,
    ttl = 2,
    damage = 1,
    ownerId = null,
  }: BulletOptions = {}) {
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

  override update(dt: number, world?: WorldLike): void {
    super.update(dt, world);

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }
}
