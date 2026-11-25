export type Brand<T, B extends string> = T & { readonly __brand: B };

export type EntityId = Brand<number, 'EntityId'>;
export type PlayerId = Brand<number, 'PlayerId'>;
export type Tick = Brand<number, 'Tick'>;
export type Seq = Brand<number, 'Seq'>;

// Р„РґРёРЅРµ РјС–СЃС†Рµ СЃС‚РІРѕСЂРµРЅРЅСЏ branded-С‡РёСЃРµР» С–Р· РїРµСЂРµРІС–СЂРєРѕСЋ Р±РµР· СЂР°РЅС‚Р°Р№Рј-РІРёС‚СЂР°С‚
function makeBrand<B extends string>(value: number): Brand<number, B> {
  // Єдине приведення примітиву до branded-типу
  return value as Brand<number, B>;
}

export const asEntityId = (value: number): EntityId => makeBrand<'EntityId'>(value);
export const asPlayerId = (value: number): PlayerId => makeBrand<'PlayerId'>(value);
export const asTick = (value: number): Tick => makeBrand<'Tick'>(value);
export const asSeq = (value: number): Seq => makeBrand<'Seq'>(value);

export type TurnDirection = -1 | 0 | 1;
export type BinaryFlag = 0 | 1;

export interface PlayerInput {
  readonly seq: Seq;
  readonly tick: Tick;
  readonly turn: TurnDirection;
  readonly thrust: BinaryFlag;
  readonly fire: BinaryFlag;
}

export interface ShipSnapshot {
  readonly kind: 'ship';
  readonly id: EntityId;
  readonly playerId: PlayerId | null;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly radius: number;
  readonly hp: number;
  readonly score: number;
  readonly thrust: BinaryFlag;
  readonly invulnerable: BinaryFlag;
}

export interface BulletSnapshot {
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

export interface AsteroidSnapshot {
  readonly kind: 'asteroid';
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly radius: number;
}

export type EntitySnapshot = ShipSnapshot | BulletSnapshot | AsteroidSnapshot;
export type EntityKind = EntitySnapshot['kind'];

export type WorldEvent =
  | {
      readonly type: 'hit';
      readonly bulletId: EntityId;
      readonly targetId: EntityId;
      readonly targetKind: 'ship' | 'asteroid';
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'exploded';
      readonly entityId: EntityId;
      readonly kind: 'ship' | 'asteroid';
      readonly x: number;
      readonly y: number;
    };
