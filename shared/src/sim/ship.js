import { Entity } from './entity.js';
import { Vector2 } from './vector.js';
import { Bullet } from './bullet.js';

export const SHIP_TURN_SPEED = 3;
export const SHIP_THRUST_ACCEL = 180;
export const SHIP_FIRE_COOLDOWN = 0.22;

export class Ship extends Entity {
  #hp;

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
  } = {}) {
    super({
      id,
      pos,
      vel,
      angle,
      radius,
      kind: 'ship',
    });

    this.playerId = playerId;
    this.name = name;
    this.#hp = hp;
    this.score = score;
    this.thrust = thrust;
    this.thrustTime = thrustTime;
    this.fireCooldown = fireCooldown;
    this.invulnerable = invulnerable;
    this.shieldTime = shieldTime;
  }

  get hp() {
    return this.#hp;
  }

  set hp(value) {
    this.#hp = value;
  }

  applyInput(input, dt) {
    if (!this.alive || !input) return null;

    const turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
    const thrust = input.thrust ? 1 : 0;

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

  update(dt, world) {
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

  takeDamage(amount = 1) {
    if (this.invulnerable || !this.alive) return;

    this.#hp -= amount;

    if (this.#hp <= 0) {
      this.#hp = 0;
      this.destroy();
    }
  }

  fire() {
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

  toSnapshot() {
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

  static fromSnapshot(data) {
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