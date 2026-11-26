import {
  Ship,
  asSeq,
  asTick,
  type EntityId,
  type PlayerId,
  type PlayerInput,
  type TurnDirection,
  type World,
} from 'shared';

export class BotController {
  readonly id: PlayerId;
  readonly name: string;
  ship: Ship | null = null;
  #seq = 0;

  constructor(id: PlayerId, name: string) {
    this.id = id;
    this.name = name;
  }

  decide(world: World, tick: number): PlayerInput {
    this.#seq += 1;
    const ship = this.ship;
    if (!ship || !ship.alive) {
      return {
        seq: asSeq(this.#seq),
        tick: asTick(tick),
        turn: 0,
        thrust: 0,
        fire: 0,
      };
    }

    let nearestTarget: { x: number; y: number; dist: number; id: EntityId } | null = null;

    for (const entity of world) {
      if (!entity.alive || entity.id === ship.id) continue;
      if (entity.kind !== 'asteroid' && entity.kind !== 'ship') continue;

      const dx = entity.pos.x - ship.pos.x;
      const dy = entity.pos.y - ship.pos.y;
      const dist = Math.hypot(dx, dy);

      if (!nearestTarget || dist < nearestTarget.dist) {
        nearestTarget = { x: entity.pos.x, y: entity.pos.y, dist, id: entity.id };
      }
    }

    if (!nearestTarget) {
      return {
        seq: asSeq(this.#seq),
        tick: asTick(tick),
        turn: 1,
        thrust: 1,
        fire: 0,
      };
    }

    const desiredAngle = Math.atan2(
      nearestTarget.y - ship.pos.y,
      nearestTarget.x - ship.pos.x,
    );
    let diff = desiredAngle - ship.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const turn: TurnDirection = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
    const thrust = nearestTarget.dist > 140 ? 1 : 0;
    const fire = Math.abs(diff) < 0.25 && nearestTarget.dist < 420 ? 1 : 0;

    return {
      seq: asSeq(this.#seq),
      tick: asTick(tick),
      turn,
      thrust,
      fire,
    };
  }
}
