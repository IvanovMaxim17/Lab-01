import {
  ENTITY_KIND,
  ENTITY_KIND_BY_CODE,
  MSG_TYPE,
  PROTOCOL_VERSION,
  clampInput,
  type RawInput,
  type WireEntitySnapshot,
  type WireMessage,
} from './protocol.js';
import {
  asEntityId,
  asSeq,
  asTick,
  type BinaryFlag,
  type EntityId,
  type EntityKind,
  type Seq,
  type Tick,
  type TurnDirection,
} from './types.js';

const ANGLE_SCALE = 1000;

export type MessageFormat = 'binary' | 'json';

export interface EncodableEntity {
  readonly id: number | EntityId;
  readonly kind: EntityKind;
  readonly x: number;
  readonly y: number;
  readonly vx?: number | undefined;
  readonly vy?: number | undefined;
  readonly angle?: number | undefined;
  readonly radius?: number | undefined;
  readonly hp?: number | undefined;
  readonly thrust?: number | boolean | undefined;
  readonly invulnerable?: number | boolean | undefined;
  readonly score?: number | undefined;
  readonly ownerId?: number | EntityId | null | undefined;
}

export type EncodableMessage =
  | ({ readonly type: 'input' } & RawInput)
  | {
      readonly type: 'snapshot';
      readonly tick: number | Tick;
      readonly lastProcessedSeq?: number | Seq | undefined;
      readonly ackSeq?: number | Seq | undefined;
      readonly yourShipId?: number | EntityId | null | undefined;
      readonly entities?: readonly EncodableEntity[] | undefined;
    }
  | {
      readonly type: 'ping' | 'pong';
      readonly clientTime: number;
    };

export function encodeAngleInt16(rad: number): number {
  let normalized = rad % (Math.PI * 2);
  if (normalized > Math.PI) normalized -= Math.PI * 2;
  if (normalized < -Math.PI) normalized += Math.PI * 2;
  const scaled = Math.round(normalized * ANGLE_SCALE);
  return Math.max(-32768, Math.min(32767, scaled));
}

export function decodeAngleInt16(int16Val: number): number {
  return int16Val / ANGLE_SCALE;
}

export function encodeBinary(message: EncodableMessage): ArrayBuffer {
  if (message.type === 'input') {
    const clean = clampInput(message);
    const buffer = new ArrayBuffer(13);
    const view = new DataView(buffer);
    view.setUint8(0, PROTOCOL_VERSION);
    view.setUint8(1, MSG_TYPE.INPUT);
    view.setUint32(2, Number(clean.seq) >>> 0, true);
    view.setUint32(6, Number(clean.tick) >>> 0, true);
    view.setInt8(10, clean.turn);
    view.setUint8(11, clean.thrust);
    view.setUint8(12, clean.fire);
    return buffer;
  }

  if (message.type === 'snapshot') {
    const entities = message.entities ?? [];
    const headerSize = 16;
    const entitySize = 27;
    const buffer = new ArrayBuffer(headerSize + entities.length * entitySize);
    const view = new DataView(buffer);

    view.setUint8(0, PROTOCOL_VERSION);
    view.setUint8(1, MSG_TYPE.SNAPSHOT);
    view.setUint32(2, Number(message.tick) >>> 0, true);
    view.setUint32(
      6,
      Number(message.lastProcessedSeq ?? message.ackSeq ?? 0) >>> 0,
      true,
    );
    view.setUint16(10, Number(message.yourShipId ?? 0) & 0xffff, true);
    view.setUint16(12, entities.length & 0xffff, true);
    view.setUint16(14, 0, true);

    let offset = headerSize;
    for (const ent of entities) {
      const kindCode = ENTITY_KIND[ent.kind] ?? 0;
      view.setUint16(offset, Number(ent.id) & 0xffff, true);
      view.setUint8(offset + 2, kindCode);
      view.setFloat32(offset + 3, ent.x, true);
      view.setFloat32(offset + 7, ent.y, true);
      view.setFloat32(offset + 11, ent.vx ?? 0, true);
      view.setFloat32(offset + 15, ent.vy ?? 0, true);
      view.setInt16(offset + 19, encodeAngleInt16(ent.angle ?? 0), true);
      view.setUint8(offset + 21, Math.min(255, Math.round(ent.radius ?? 10)));

      let meta = 0;
      let score = 0;
      if (ent.kind === 'ship') {
        const hp = Math.max(0, Math.min(15, ent.hp ?? 3));
        const thrustBit = ent.thrust ? 1 << 4 : 0;
        const invulnBit = ent.invulnerable ? 1 << 5 : 0;
        meta = hp | thrustBit | invulnBit;
        score = ent.score ?? 0;
      } else if (ent.kind === 'bullet') {
        meta = Number(ent.ownerId ?? 0) & 0xff;
      }
      view.setUint8(offset + 22, meta);
      view.setInt32(offset + 23, score, true);

      offset += entitySize;
    }

    return buffer;
  }

  if (message.type === 'ping' || message.type === 'pong') {
    const buffer = new ArrayBuffer(10);
    const view = new DataView(buffer);
    view.setUint8(0, PROTOCOL_VERSION);
    view.setUint8(1, message.type === 'ping' ? MSG_TYPE.PING : MSG_TYPE.PONG);
    view.setFloat64(2, Number(message.clientTime) || 0, true);
    return buffer;
  }

  throw new Error('Unsupported binary message type');
}

export function decodeBinary(data: ArrayBuffer | ArrayBufferView): WireMessage {
  const view =
    data instanceof ArrayBuffer
      ? new DataView(data)
      : new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (view.byteLength < 2) {
    throw new Error('Binary frame too short');
  }

  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version}`);
  }

  const msgType = view.getUint8(1);

  if (msgType === MSG_TYPE.INPUT) {
    if (view.byteLength < 13) throw new Error('Invalid INPUT frame length');
    const rawTurn = view.getInt8(10);
    const turn: TurnDirection = rawTurn < 0 ? -1 : rawTurn > 0 ? 1 : 0;
    const thrust: BinaryFlag = view.getUint8(11) ? 1 : 0;
    const fire: BinaryFlag = view.getUint8(12) ? 1 : 0;

    return {
      type: 'input',
      seq: asSeq(view.getUint32(2, true)),
      tick: asTick(view.getUint32(6, true)),
      turn,
      thrust,
      fire,
    };
  }

  if (msgType === MSG_TYPE.SNAPSHOT) {
    if (view.byteLength < 16) throw new Error('Invalid SNAPSHOT header length');
    const tick = asTick(view.getUint32(2, true));
    const lastProcessedSeq = asSeq(view.getUint32(6, true));
    const yourShipId = asEntityId(view.getUint16(10, true));
    const count = view.getUint16(12, true);
    const entities: WireEntitySnapshot[] = [];

    let offset = 16;
    for (let i = 0; i < count; i++) {
      if (offset + 27 > view.byteLength) break;
      const id = asEntityId(view.getUint16(offset, true));
      const kindCode = view.getUint8(offset + 2);
      const kind = ENTITY_KIND_BY_CODE[kindCode] ?? 'asteroid';
      const x = view.getFloat32(offset + 3, true);
      const y = view.getFloat32(offset + 7, true);
      const vx = view.getFloat32(offset + 11, true);
      const vy = view.getFloat32(offset + 15, true);
      const angle = decodeAngleInt16(view.getInt16(offset + 19, true));
      const radius = view.getUint8(offset + 21);
      const meta = view.getUint8(offset + 22);
      const score = view.getInt32(offset + 23, true);

      if (kind === 'ship') {
        entities.push({
          id,
          kind: 'ship',
          x,
          y,
          vx,
          vy,
          angle,
          radius,
          hp: meta & 0x0f,
          thrust: meta & (1 << 4) ? 1 : 0,
          invulnerable: Boolean(meta & (1 << 5)),
          score,
        });
      } else if (kind === 'bullet') {
        entities.push({
          id,
          kind: 'bullet',
          x,
          y,
          vx,
          vy,
          angle,
          radius,
          ownerId: asEntityId(meta),
        });
      } else {
        entities.push({
          id,
          kind: 'asteroid',
          x,
          y,
          vx,
          vy,
          angle,
          radius,
        });
      }

      offset += 27;
    }

    return {
      type: 'snapshot',
      tick,
      lastProcessedSeq,
      yourShipId,
      entities,
    };
  }

  if (msgType === MSG_TYPE.PING || msgType === MSG_TYPE.PONG) {
    if (view.byteLength < 10) throw new Error('Invalid PING/PONG length');
    return {
      type: msgType === MSG_TYPE.PING ? 'ping' : 'pong',
      clientTime: view.getFloat64(2, true),
    };
  }

  throw new Error(`Unknown binary message type: ${msgType}`);
}

export function encodeMessage(
  message: EncodableMessage,
  format: MessageFormat = 'binary',
): string | ArrayBuffer {
  if (format === 'json') {
    return JSON.stringify(message);
  }
  return encodeBinary(message);
}

export function decodeMessage(
  raw: string | ArrayBuffer | ArrayBufferView,
): WireMessage {
  if (typeof raw === 'string') {
    // JsonCodec серіалізує та десеріалізує узгоджені WireMessage пакети
  return JSON.parse(raw) as WireMessage;
  }
  return decodeBinary(raw);
}

