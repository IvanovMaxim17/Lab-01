import {
  asEntityId,
  type EntityId,
  type EntityKind,
  type EntitySnapshot,
} from '../types.js';
import { Vector2 } from './vector.js';

export interface Behavior {
  update(entity: Entity, dt: number, world?: unknown): void;
}

export interface EntityOptions {
  id?: EntityId | number | null;
  pos?: Vector2;
  vel?: Vector2;
  angle?: number;
  radius?: number;
  kind: EntityKind;
}

export abstract class Entity {
  static #nextId = 1;
  #id: EntityId;

  pos: Vector2;
  vel: Vector2;
  angle: number;
  radius: number;
  readonly kind: EntityKind;
  alive: boolean;
  behaviors: Set<Behavior>;

  constructor({
    id = null,
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 10,
    kind,
  }: EntityOptions) {
    if (id !== null && id !== undefined) {
      const numericId = Number(id);
      this.#id = asEntityId(numericId);
      if (numericId >= Entity.#nextId) {
        Entity.#nextId = numericId + 1;
      }
    } else {
      this.#id = asEntityId(Entity.#nextId++);
    }

    this.pos = pos;
    this.vel = vel;
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = true;
    this.behaviors = new Set();
  }

  static resetIds(start = 1): void {
    Entity.#nextId = start;
  }

  get id(): EntityId {
    return this.#id;
  }

  update(dt: number, world?: unknown): void {
    for (const behavior of this.behaviors) {
      behavior.update(this, dt, world);
    }

    this.pos = this.pos.add(this.vel.scale(dt));
  }

  addBehavior(behavior: Behavior): this {
    this.behaviors.add(behavior);
    return this;
  }

  removeBehavior(behavior: Behavior): void {
    this.behaviors.delete(behavior);
  }

  destroy(): void {
    this.alive = false;
  }

  abstract toSnapshot(): EntitySnapshot;
}