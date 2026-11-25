import { Entity, type EntityOptions } from './entity.js';
import { Vector2 } from './vector.js';
import { Bullet } from './bullet.js';

export interface ShipOptions extends Omit<EntityOptions, 'kind'> {
  hp?: number;
}

export class Ship extends Entity {
  #hp: number;
  score: number;
  invulnerable: boolean;
  shieldTime?: number;
  rapidFireTime?: number;

  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 15,
    hp = 3,
  }: ShipOptions = {}) {
    super({
      pos,
      vel,
      angle,
      radius,
      kind: 'ship',
    });

    this.#hp = hp;
    this.score = 0;
    this.invulnerable = false;
  }

  get hp(): number {
    return this.#hp;
  }

  takeDamage(amount = 1): void {
    if (this.invulnerable || !this.alive) return;

    this.#hp -= amount;

    if (this.#hp <= 0) {
      this.destroy();
    }
  }

  fire(): Bullet {
    const direction = Vector2.fromAngle(this.angle);
    const nose = this.pos.add(direction.scale(this.radius + 5));
    const bulletVelocity = this.vel.add(direction.scale(400));

    return new Bullet({
      pos: nose,
      vel: bulletVelocity,
      angle: this.angle,
      ownerId: this.id,
    });
  }
}
