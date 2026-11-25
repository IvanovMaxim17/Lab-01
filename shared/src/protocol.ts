import {
  asSeq,
  asTick,
  type BinaryFlag,
  type EntityId,
  type EntityKind,
  type PlayerId,
  type PlayerInput,
  type Seq,
  type Tick,
  type TurnDirection,
} from './types.js';

export const PROTOCOL_VERSION = 1 as const;

export const MSG_TYPE = {
  INPUT: 1,
  SNAPSHOT: 2,
  PING: 3,
  PONG: 4,
} as const;

export type MsgTypeCode = (typeof MSG_TYPE)[keyof typeof MSG_TYPE];

export const ENTITY_KIND = {
  ship: 1,
  bullet: 2,
  asteroid: 3,
} as const satisfies Record<EntityKind, number>;

export type EntityKindCode = (typeof ENTITY_KIND)[EntityKind];

export const ENTITY_KIND_BY_CODE: Readonly<Record<number, EntityKind>> = {
  1: 'ship',
  2: 'bullet',
  3: 'asteroid',
};

export interface RawInput {
  readonly seq?: number | Seq | undefined;
  readonly tick?: number | Tick | undefined;
  readonly turn?: number | undefined;
  readonly thrust?: number | boolean | undefined;
  readonly fire?: number | boolean | undefined;
}

export interface InputMessage {
  readonly type: 'input';
  readonly seq: Seq;
  readonly tick: Tick;
  readonly turn: TurnDirection;
  readonly thrust: BinaryFlag;
  readonly fire: BinaryFlag;
}

export interface WireShipSnapshot {
  readonly kind: 'ship';
  readonly id: EntityId;
  readonly playerId?: PlayerId | null | undefined;
  readonly name?: string | undefined;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly radius: number;
  readonly hp: number;
  readonly score: number;
  readonly thrust: BinaryFlag;
  readonly invulnerable: boolean | BinaryFlag;
}

export interface WireBulletSnapshot {
  readonly kind: 'bullet';
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly radius: number;
  readonly ownerId: EntityId | null;
}

export interface WireAsteroidSnapshot {
  readonly kind: 'asteroid';
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly radius: number;
}

export type WireEntitySnapshot =
  | WireShipSnapshot
  | WireBulletSnapshot
  | WireAsteroidSnapshot;

export interface SnapshotMessage {
  readonly type: 'snapshot';
  readonly tick: Tick;
  readonly lastProcessedSeq: Seq;
  readonly ackSeq?: Seq | undefined;
  readonly yourShipId: EntityId;
  readonly entities: readonly WireEntitySnapshot[];
}

export interface PingMessage {
  readonly type: 'ping';
  readonly clientTime: number;
}

export interface PongMessage {
  readonly type: 'pong';
  readonly clientTime: number;
}

export type WireMessage =
  | InputMessage
  | SnapshotMessage
  | PingMessage
  | PongMessage;

export function clampInput(raw: RawInput | null | undefined): PlayerInput {
  const rawTurn = Math.round(Number(raw?.turn) || 0);
  const turn: TurnDirection = rawTurn < 0 ? -1 : rawTurn > 0 ? 1 : 0;
  const thrust: BinaryFlag = raw?.thrust ? 1 : 0;
  const fire: BinaryFlag = raw?.fire ? 1 : 0;
  const seq = asSeq((Number(raw?.seq) || 0) >>> 0);
  const tick = asTick((Number(raw?.tick) || 0) >>> 0);

  return { seq, tick, turn, thrust, fire };
}


