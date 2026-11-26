import {
  asPlayerId,
  type BinaryFlag,
  type EntityId,
  type PlayerId,
  type ShipSnapshot,
} from '../types.js';
import { Bullet } from './bullet.js';
import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export const SHIP_TURN_SPEED = 3;
export const SHIP_THRUST_ACCEL = 180;
export const SHIP_FIRE_COOLDOWN = 0.22;

export interface ShipOptions {
  id?: EntityId | number | null;
  playerId?: PlayerId | number | null;
  name?: string;
  pos?: Vector2;
  vel?: Vector2;
  angle?: number;
  radius?: number;
  hp?: number;
  score?: number;
  thrust?: number | boolean;
  thrustTime?: number;
  fireCooldown?: number;
  invulnerable?: number | boolean;
  shieldTime?: number;
}

export interface ShipInputLike {
  turn?: number;
  thrust?: number | boolean;
  fire?: number | boolean;
}

export class Ship extends Entity {
  #hp: number;
  playerId: PlayerId | null;
  name: string;
  score: number;
  thrust: BinaryFlag;
  thrustTime: number;
  fireCooldown: number;
  invulnerable: boolean;
  shieldTime: number;

  constructor({
    id = null,
    playerId = null,
    name = 'Player',
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 15,
    hp = 3,
    score = 0,
    thrust = 0,
    thrustTime = 0,
    fireCooldown = 0,
    invulnerable = false,
    shieldTime = 0,
  }: ShipOptions = {}) {
    super({
      id,
      pos,
      vel,
      angle,
      radius,
      kind: 'ship',
    });

    this.playerId =
      playerId !== null && playerId !== undefined
        ? asPlayerId(Number(playerId))
        : null;
    this.name = name;
    this.#hp = hp;
    this.score = score;
    this.thrust = thrust ? 1 : 0;
    this.thrustTime = thrustTime;
    this.fireCooldown = fireCooldown;
    this.invulnerable = Boolean(invulnerable);
    this.shieldTime = shieldTime;
  }

  get hp(): number {
    return this.#hp;
  }

  set hp(value: number) {
    this.#hp = value;
  }

  applyInput(input: ShipInputLike | null | undefined, dt: number): Bullet | null {
    if (!this.alive || !input) return null;

    const turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
    const thrust: BinaryFlag = input.thrust ? 1 : 0;

    this.angle += turn * SHIP_TURN_SPEED * dt;

    if (thrust > 0) {
      const direction = Vector2.fromAngle(this.angle);
      this.vel = this.vel.add(direction.scale(SHIP_THRUST_ACCEL * dt));
      this.thrust = 1;
      this.thrustTime += dt;
    } else {
      this.thrust = 0;
      this.thrustTime = 0;
    }

    if (input.fire && this.fireCooldown <= 0) {
      this.fireCooldown = SHIP_FIRE_COOLDOWN;
      return this.fire();
    }

    return null;
  }

  override update(dt: number, world?: unknown): void {
    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    }

    if (this.shieldTime > 0) {
      this.shieldTime = Math.max(0, this.shieldTime - dt);
      if (this.shieldTime === 0) {
        this.invulnerable = false;
      }
    }

    super.update(dt, world);
  }

  takeDamage(amount = 1): void {
    if (this.invulnerable || !this.alive) return;

    this.#hp -= amount;

    if (this.#hp <= 0) {
      this.#hp = 0;
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

  override toSnapshot(): ShipSnapshot {
    return {
      id: this.id,
      kind: 'ship',
      playerId: this.playerId,
      name: this.name,
      x: this.pos.x,
      y: this.pos.y,
      vx: this.vel.x,
      vy: this.vel.y,
      angle: this.angle,
      radius: this.radius,
      hp: this.#hp,
      score: this.score,
      thrust: this.thrust,
      invulnerable: this.invulnerable ? 1 : 0,
    };
  }

  static fromSnapshot(data: ShipSnapshot): Ship {
    return new Ship({
      id: data.id,
      playerId: data.playerId ?? null,
      name: data.name ?? 'Player',
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx ?? 0, data.vy ?? 0),
      angle: data.angle ?? 0,
      radius: data.radius ?? 15,
      hp: data.hp ?? 3,
      score: data.score ?? 0,
      thrust: data.thrust ?? 0,
      invulnerable: Boolean(data.invulnerable),
    });
  }
}
