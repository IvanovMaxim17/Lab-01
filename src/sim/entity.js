
import { Vector2 } from './vector.js';

export class Entity {
  static #nextId = 1;
  #id;

  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 10,
    kind = 'entity',
  } = {}) {
    this.#id = Entity.#nextId++;
    this.pos = pos;
    this.vel = vel;
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = true;
    this.behaviors = new Set();
  }

  get id() {
    return this.#id;
  }

  update(dt, world) {
    for (const behavior of this.behaviors) {
      behavior.update(this, dt, world);
    }

    this.pos = this.pos.add(this.vel.scale(dt));
  }

  addBehavior(behavior) {
    this.behaviors.add(behavior);
    return this;
  }

  removeBehavior(behavior) {
    this.behaviors.delete(behavior);
  }

  destroy() {
    this.alive = false;
  }
}
