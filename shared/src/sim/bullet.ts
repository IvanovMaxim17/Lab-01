import {
  asEntityId,
  type BulletSnapshot,
  type EntityId,
} from '../types.js';
import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export interface BulletOptions {
  id?: EntityId | number | null;
  pos?: Vector2;
  vel?: Vector2;
  angle?: number;
  radius?: number;
  ttl?: number;
  damage?: number;
  ownerId?: EntityId | number | null;
}

export class Bullet extends Entity {
  ttl: number;
  damage: number;
  ownerId: EntityId | null;

  constructor({
    id = null,
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 3,
    ttl = 2,
    damage = 1,
    ownerId = null,
  }: BulletOptions = {}) {
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
    this.ownerId =
      ownerId !== null && ownerId !== undefined
        ? asEntityId(Number(ownerId))
        : null;
  }

  override update(dt: number, world?: unknown): void {
    super.update(dt, world);

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  override toSnapshot(): BulletSnapshot {
    return {
      id: this.id,
      kind: 'bullet',
      x: this.pos.x,
      y: this.pos.y,
      vx: this.vel.x,
      vy: this.vel.y,
      angle: this.angle,
      radius: this.radius,
      ownerId: this.ownerId,
    };
  }

  static fromSnapshot(data: BulletSnapshot): Bullet {
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