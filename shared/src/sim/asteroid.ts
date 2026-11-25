import { Entity } from './entity.js';
import type { AsteroidSnapshot, EntityId } from '../types.js';
import { asEntityId } from '../types.js';
import { Vector2 } from './vector.js';

export interface AsteroidOptions {
  readonly id?: EntityId;
  readonly pos?: Vector2;
  readonly vel?: Vector2;
  readonly angle?: number;
  readonly radius?: number;
  readonly size?: number;
}

function hasBounds(world: unknown): world is { readonly width: number; readonly height: number } {
  return (
    typeof world === 'object' &&
    world !== null &&
    'width' in world &&
    'height' in world &&
    typeof world.width === 'number' &&
    typeof world.height === 'number'
  );
}

export class Asteroid extends Entity {
  override readonly kind = 'asteroid' as const;
  size: number;

  constructor({
    id,
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 20,
    size = 3,
  }: AsteroidOptions = {}) {
    super({
      ...(id !== undefined ? { id } : {}),
      pos,
      vel,
      angle,
      radius,
      kind: 'asteroid',
    });

    this.size = size;
  }

  override update(dt: number, world?: unknown): void {
    super.update(dt, world);

    if (!hasBounds(world)) {
      return;
    }

    const { width, height } = world;

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

  override toSnapshot(): AsteroidSnapshot {
    return {
      kind: 'asteroid',
      id: this.id,
      x: this.pos.x,
      y: this.pos.y,
      vx: this.vel.x,
      vy: this.vel.y,
      angle: this.angle,
      radius: this.radius,
    };
  }

  static fromSnapshot(snapshot: Omit<AsteroidSnapshot, 'kind'>): Asteroid {
    return new Asteroid({
      id: asEntityId(snapshot.id),
      pos: new Vector2(snapshot.x, snapshot.y),
      vel: new Vector2(snapshot.vx, snapshot.vy),
      angle: snapshot.angle,
      radius: snapshot.radius,
    });
  }
}
