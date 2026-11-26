import { Ship } from './sim/ship.js';
import { Vector2 } from './sim/vector.js';
import type { BinaryFlag, TurnDirection } from './types.js';

export interface ReconcileInput {
  readonly seq: number;
  readonly turn: TurnDirection;
  readonly thrust: BinaryFlag;
  readonly fire: BinaryFlag;
}

export interface AuthoritativeShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly radius?: number;
  readonly hp?: number;
  readonly score?: number;
}

export interface ReconcileResult {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly pendingInputs: ReconcileInput[];
}

export function reconcileShip(
  authoritative: AuthoritativeShipState,
  pendingInputs: readonly ReconcileInput[],
  lastProcessedSeq: number,
  dt: number,
  worldWidth: number,
  worldHeight: number,
): ReconcileResult {
  const remaining = pendingInputs.filter((cmd) => cmd.seq > lastProcessedSeq);
  const ship = new Ship({
    pos: new Vector2(authoritative.x, authoritative.y),
    vel: new Vector2(authoritative.vx, authoritative.vy),
    angle: authoritative.angle,
    radius: authoritative.radius ?? 15,
    hp: authoritative.hp ?? 3,
    score: authoritative.score ?? 0,
  });

  for (const cmd of remaining) {
    ship.applyInput(cmd, dt);
    ship.update(dt);
    const x = ((ship.pos.x % worldWidth) + worldWidth) % worldWidth;
    const y = ((ship.pos.y % worldHeight) + worldHeight) % worldHeight;
    ship.pos = new Vector2(x, y);
  }

  return {
    x: ship.pos.x,
    y: ship.pos.y,
    vx: ship.vel.x,
    vy: ship.vel.y,
    angle: ship.angle,
    pendingInputs: remaining,
  };
}
