import { Vector2 } from './vector.js';

export interface WorldLike {
  readonly width: number;
  readonly height: number;
  [Symbol.iterator](): IterableIterator<Entity>;
  ofKind(kind: string): IterableIterator<Entity>;
  spawn<T extends Entity>(entity: T): T;
}

export interface Behavior {
  update(entity: Entity, dt: number, world?: WorldLike): void;
}

export interface EntityOptions {
  pos?: Vector2;
  vel?: Vector2;
  angle?: number;
  radius?: number;
  kind?: string;
}

export class Entity {
  static #nextId = 1;
  #id: number;
  pos: Vector2;
  vel: Vector2;
  angle: number;
  radius: number;
  kind: string;
  alive: boolean;
  behaviors: Set<Behavior>;

  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 10,
    kind = 'entity',
  }: EntityOptions = {}) {
    this.#id = Entity.#nextId++;
    this.pos = pos;
    this.vel = vel;
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = true;
    this.behaviors = new Set();
  }

  get id(): number {
    return this.#id;
  }

  update(dt: number, world?: WorldLike): void {
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
}
