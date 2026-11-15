import {
  PROTOCOL_VERSION,
  MSG_TYPE,
  ENTITY_KIND,
  ENTITY_KIND_BY_CODE,
  clampInput,
} from './protocol.js';

/**
 * Бінарна специфікація протоколу SpaceFight (Little-Endian, version = 1):
 *
 * 1) INPUT (клієнт -> сервер), фіксована довжина = 13 байт:
 *    byte 0:      uint8  version (1)
 *    byte 1:      uint8  msgType (MSG_TYPE.INPUT = 1)
 *    bytes 2..5:  uint32 seq (little-endian)
 *    bytes 6..9:  uint32 tick (little-endian)
 *    byte 10:     int8   turn (-1, 0, 1)
 *    byte 11:     uint8  thrust (0 або 1)
 *    byte 12:     uint8  fire (0 або 1)
 *
 * 2) SNAPSHOT (сервер -> клієнт), заголовок 16 байт + 27 байт на кожну сутність:
 *    byte 0:       uint8   version (1)
 *    byte 1:       uint8   msgType (MSG_TYPE.SNAPSHOT = 2)
 *    bytes 2..5:   uint32  tick
 *    bytes 6..9:   uint32  lastProcessedSeq
 *    bytes 10..11: uint16  yourShipId
 *    bytes 12..13: uint16  entityCount
 *    bytes 14..15: uint16  reserved (0)
 *    Далі для кожної сутності (27 байт):
 *      bytes +0..1:   uint16  id
 *      byte  +2:      uint8   kind (1=ship, 2=bullet, 3=asteroid)
 *      bytes +3..6:   float32 x
 *      bytes +7..10:  float32 y
 *      bytes +11..14: float32 vx
 *      bytes +15..18: float32 vy
 *      bytes +19..20: int16   angle (у 1/1000 радіана, little-endian)
 *      byte  +21:     uint8   radius
 *      byte  +22:     uint8   meta (ship: bits 0..3 = hp, bit 4 = thrust, bit 5 = invulnerable; bullet: ownerId & 0xff)
 *      bytes +23..26: int32   score (для ship; 0 для інших)
 *
 * 3) PING / PONG (10 байт):
 *    byte 0:      uint8   version (1)
 *    byte 1:      uint8   msgType (3 = PING, 4 = PONG)
 *    bytes 2..9:  float64 clientTime
 */

const ANGLE_SCALE = 1000;

export function encodeAngleInt16(rad) {
  let normalized = rad % (Math.PI * 2);
  if (normalized > Math.PI) normalized -= Math.PI * 2;
  if (normalized < -Math.PI) normalized += Math.PI * 2;
  const scaled = Math.round(normalized * ANGLE_SCALE);
  return Math.max(-32768, Math.min(32767, scaled));
}

export function decodeAngleInt16(int16Val) {
  return int16Val / ANGLE_SCALE;
}

export function encodeBinary(message) {
  if (message.type === 'input') {
    const clean = clampInput(message);
    const buffer = new ArrayBuffer(13);
    const view = new DataView(buffer);
    view.setUint8(0, PROTOCOL_VERSION);
    view.setUint8(1, MSG_TYPE.INPUT);
    view.setUint32(2, clean.seq, true);
    view.setUint32(6, clean.tick, true);
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
    view.setUint32(2, message.tick >>> 0, true);
    view.setUint32(6, (message.lastProcessedSeq ?? message.ackSeq ?? 0) >>> 0, true);
    view.setUint16(10, (message.yourShipId ?? 0) & 0xffff, true);
    view.setUint16(12, entities.length & 0xffff, true);
    view.setUint16(14, 0, true);

    let offset = headerSize;
    for (const ent of entities) {
      const kindCode = ENTITY_KIND[ent.kind] ?? 0;
      view.setUint16(offset, ent.id & 0xffff, true);
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
        meta = (ent.ownerId ?? 0) & 0xff;
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

  throw new Error(`Unsupported binary message type: ${message.type}`);
}

export function decodeBinary(data) {
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
    return {
      type: 'input',
      seq: view.getUint32(2, true),
      tick: view.getUint32(6, true),
      turn: view.getInt8(10),
      thrust: view.getUint8(11),
      fire: view.getUint8(12),
    };
  }

  if (msgType === MSG_TYPE.SNAPSHOT) {
    if (view.byteLength < 16) throw new Error('Invalid SNAPSHOT header length');
    const tick = view.getUint32(2, true);
    const lastProcessedSeq = view.getUint32(6, true);
    const yourShipId = view.getUint16(10, true);
    const count = view.getUint16(12, true);
    const entities = [];

    let offset = 16;
    for (let i = 0; i < count; i++) {
      if (offset + 27 > view.byteLength) break;
      const id = view.getUint16(offset, true);
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

      const ent = { id, kind, x, y, vx, vy, angle, radius };
      if (kind === 'ship') {
        ent.hp = meta & 0x0f;
        ent.thrust = (meta & (1 << 4)) ? 1 : 0;
        ent.invulnerable = Boolean(meta & (1 << 5));
        ent.score = score;
      } else if (kind === 'bullet') {
        ent.ownerId = meta;
      }

      entities.push(ent);
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

export function encodeMessage(message, format = 'binary') {
  if (format === 'json') {
    return JSON.stringify(message);
  }
  return encodeBinary(message);
}

export function decodeMessage(raw) {
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  return decodeBinary(raw);
}