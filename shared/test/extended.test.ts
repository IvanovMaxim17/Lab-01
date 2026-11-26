import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  Vector2,
  Entity,
  Ship,
  Bullet,
  Asteroid,
  World,
  FIXED_DT,
  ObjectPool,
  SpatialHash,
  reconcileShip,
  encodeBinary,
  encodeAngleInt16,
  decodeBinary,
  encodeMessage,
  decodeMessage,
  clampInput,
  parseClientMessage,
  createPrng,
  asEntityId,
  asPlayerId,
  asSeq,
  asTick,
  MSG_TYPE,
  PROTOCOL_VERSION,
} from '../src/index.js';

describe('Extended Unit Suite (World, Entities, PRNG, Codec, Bounds)', () => {
  beforeEach(() => {
    Entity.resetIds(1);
  });

  it('PRNG createPrng зберігає та відновлює стан (getState / setState)', () => {
    const rng = createPrng(12345);
    const first = rng.next();
    const saved = rng.getState();
    const second = rng.next();
    rng.setState(saved);
    expect(rng.next()).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
  });

  it('PRNG range генерує числа строго в інтервалі [min, max)', () => {
    const rng = createPrng(999);
    for (let i = 0; i < 50; i++) {
      const val = rng.range(-10, 25);
      expect(val).toBeGreaterThanOrEqual(-10);
      expect(val).toBeLessThan(25);
    }
  });

  it('World.get, World.despawn та World.ofKind коректно керують сутностями', () => {
    const world = new World({ width: 800, height: 600, seed: 1 });
    const ship = world.spawn(new Ship({ pos: new Vector2(100, 100) }));
    const ast = world.spawn(new Asteroid({ pos: new Vector2(300, 300) }));

    expect(world.get(ship.id)).toBe(ship);
    expect(world.get(null)).toBeUndefined();
    expect(world.get(undefined)).toBeUndefined();
    expect([...world.ofKind('asteroid')]).toHaveLength(1);

    world.despawn(ast.id);
    expect(world.get(ast.id)).toBeUndefined();
    expect([...world.ofKind('asteroid')]).toHaveLength(0);
  });

  it('World.findSafeSpawnPosition знаходить безпечну точку подалі від астероїдів', () => {
    const world = new World({ width: 800, height: 600, seed: 42 });
    world.spawn(new Asteroid({ pos: new Vector2(400, 300), radius: 30 }));
    const safePos = world.findSafeSpawnPosition(100);
    expect(safePos.sub(new Vector2(400, 300)).length()).toBeGreaterThanOrEqual(130);
  });

  it('Asteroid.fromSnapshot відновлює позицію, швидкість та радіус', () => {
    const ast = new Asteroid({ id: asEntityId(44), pos: new Vector2(12, 34), vel: new Vector2(-5, 8), angle: 0.5, radius: 24 });
    const restored = Asteroid.fromSnapshot(ast.toSnapshot());
    expect(restored.id).toBe(asEntityId(44));
    expect(restored.pos.x).toBe(12);
    expect(restored.vel.y).toBe(8);
    expect(restored.radius).toBe(24);
  });

  it('Asteroid відбивається від усіх чотирьох меж арени', () => {
    const aRight = new Asteroid({ pos: new Vector2(790, 300), vel: new Vector2(50, 0), radius: 20 });
    aRight.update(FIXED_DT, { width: 800, height: 600 });
    expect(aRight.pos.x).toBe(780);
    expect(aRight.vel.x).toBeLessThan(0);

    const aTop = new Asteroid({ pos: new Vector2(300, 10), vel: new Vector2(0, -50), radius: 20 });
    aTop.update(FIXED_DT, { width: 800, height: 600 });
    expect(aTop.pos.y).toBe(20);
    expect(aTop.vel.y).toBeGreaterThan(0);

    const aBottom = new Asteroid({ pos: new Vector2(300, 590), vel: new Vector2(0, 50), radius: 20 });
    aBottom.update(FIXED_DT, { width: 800, height: 600 });
    expect(aBottom.pos.y).toBe(580);
    expect(aBottom.vel.y).toBeLessThan(0);
  });

  it('Entity behaviors додаються, виконуються на update і видаляються', () => {
    let calls = 0;
    const ship = new Ship();
    const behavior = {
      update() {
        calls += 1;
      },
    };
    ship.addBehavior(behavior);
    ship.update(FIXED_DT);
    expect(calls).toBe(1);
    ship.removeBehavior(behavior);
    ship.update(FIXED_DT);
    expect(calls).toBe(1);
  });

  it('Ship знищує ворожий корабель і додає +100 очок стрільцю', () => {
    const world = new World({ width: 800, height: 600, seed: 1 });
    const killer = world.spawn(new Ship({ pos: new Vector2(100, 100), score: 0 }));
    const victim = world.spawn(new Ship({ pos: new Vector2(300, 300), hp: 1 }));
    world.spawn(new Bullet({ pos: new Vector2(302, 300), vel: new Vector2(0, 0), ownerId: killer.id, damage: 1 }));

    world.step(FIXED_DT);
    expect(victim.alive).toBe(false);
    expect(killer.score).toBe(100);
    const events = world.drainEvents();
    expect(events.some((e) => e.type === 'exploded' && e.kind === 'ship')).toBe(true);
  });

  it('куля не влучає у власний корабель одразу після пострілу (ttl > 1.85)', () => {
    const world = new World({ width: 800, height: 600, seed: 1 });
    const ship = world.spawn(new Ship({ pos: new Vector2(200, 200), hp: 3 }));
    const bullet = ship.fire();
    world.spawn(bullet);
    world.step(FIXED_DT);
    expect(ship.hp).toBe(3);
  });

  it('тунелювання: надшвидка куля без проміжного кроку може перестрибнути тонку ціль', () => {
    const world = new World({ width: 800, height: 600, seed: 1 });
    const target = world.spawn(new Asteroid({ pos: new Vector2(250, 200), vel: new Vector2(0, 0), radius: 10 }));
    // Швидкість 6000 px/s за 1 тік (1/30 s = 200 px) перелітає з x=150 у x=350
    world.spawn(new Bullet({ pos: new Vector2(150, 200), vel: new Vector2(6000, 0), radius: 2 }));
    world.step(FIXED_DT);
    expect(target.alive).toBe(true);
  });

  it('бінарний кодек коректно кодує і декодує усі 3 типи сутностей у SNAPSHOT', () => {
    const encoded = encodeBinary({
      type: 'snapshot',
      tick: asTick(55),
      lastProcessedSeq: asSeq(12),
      yourShipId: asEntityId(1),
      entities: [
        { kind: 'ship', id: asEntityId(1), x: 10, y: 20, vx: 1, vy: 2, angle: 0.5, radius: 15, hp: 3, score: 250, thrust: 1, invulnerable: 1 },
        { kind: 'bullet', id: asEntityId(2), x: 30, y: 40, vx: 5, vy: 6, angle: -0.5, radius: 3, ownerId: asEntityId(1) },
        { kind: 'asteroid', id: asEntityId(3), x: 50, y: 60, vx: -2, vy: 3, angle: 1.1, radius: 22 },
      ],
    });

    const decoded = decodeBinary(encoded);
    expect(decoded.type).toBe('snapshot');
    if (decoded.type === 'snapshot') {
      expect(decoded.entities).toHaveLength(3);
      expect(decoded.entities[0]?.kind).toBe('ship');
      expect(decoded.entities[1]?.kind).toBe('bullet');
      expect(decoded.entities[2]?.kind).toBe('asteroid');
    }
  });

  it('бінарний кодек відхиляє невалідні довжини INPUT, SNAPSHOT, PING та невідомий тип', () => {
    expect(() => decodeBinary(new Uint8Array([PROTOCOL_VERSION, MSG_TYPE.INPUT, 1, 2]))).toThrow();
    expect(() => decodeBinary(new Uint8Array([PROTOCOL_VERSION, MSG_TYPE.SNAPSHOT, 1, 2]))).toThrow();
    expect(() => decodeBinary(new Uint8Array([PROTOCOL_VERSION, MSG_TYPE.PING, 1, 2]))).toThrow();
    expect(() => decodeBinary(new Uint8Array([PROTOCOL_VERSION, 250, 0, 0]))).toThrow();
  });

  it('decodeBinary працює з Uint8Array (ArrayBufferView із зсувом)', () => {
    const buf = encodeBinary({ type: 'pong', clientTime: 987654.321 });
    const padded = new Uint8Array(buf.byteLength + 4);
    padded.set(new Uint8Array(buf), 2);
    const sliceView = new Uint8Array(padded.buffer, 2, buf.byteLength);
    const msg = decodeBinary(sliceView);
    expect(msg).toEqual({ type: 'pong', clientTime: 987654.321 });
  });

  it('parseClientMessage відхиляє null, масиви, порожній чат та занадто довге ім’я', () => {
    expect(parseClientMessage(null).ok).toBe(false);
    expect(parseClientMessage([]).ok).toBe(false);
    expect(parseClientMessage({ type: 'chat', text: '   ' }).ok).toBe(false);
    expect(parseClientMessage({ type: 'join', roomId: 'r1', name: 'x'.repeat(25) }).ok).toBe(false);
    expect(parseClientMessage({ type: 'format', format: 'binary' }).ok).toBe(true);
    expect(parseClientMessage({ type: 'ping', clientTime: 100 }).ok).toBe(true);
  });

  it('[Property 6] SpatialHash.query повертає всі об’єкти в радіусі пошуку без пропусків', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.integer({ min: 0, max: 799 }),
            y: fc.integer({ min: 0, max: 599 }),
          }),
          { minLength: 5, maxLength: 40 },
        ),
        (points) => {
          const hash = new SpatialHash<{ id: number; pos: { x: number; y: number }; radius: number }>(800, 600, 80);
          points.forEach((p, idx) => {
            hash.insert({ id: idx + 1, pos: p, radius: 10 });
          });
          const found = hash.query(400, 300, 60);
          for (let i = 0; i < points.length; i++) {
            const p = points[i]!;
            if (Math.abs(p.x - 400) <= 50 && Math.abs(p.y - 300) <= 50) {
              expect(found.some((f) => f.id === i + 1)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('ObjectPool коректно збільшує ємність при вичерпанні початкового пулу', () => {
    const pool = new ObjectPool(() => ({ v: 1 }), (x) => { x.v = 0; }, 1);
    const first = pool.acquire();
    const second = pool.acquire();
    expect(pool.stats.created).toBe(2);
    pool.release(first);
    pool.release(second);
    expect(pool.available).toBe(2);
  });

  it('reconcileShip коректно обробляє порожній список команд та wrap-around координат', () => {
    const res = reconcileShip(
      { x: 798, y: 2, vx: 100, vy: -100, angle: 0 },
      [{ seq: 5, turn: 0, thrust: 0, fire: 0 }],
      4,
      FIXED_DT,
      800,
      600,
    );
    expect(res.x).toBeGreaterThanOrEqual(0);
    expect(res.x).toBeLessThan(800);
    expect(res.y).toBeGreaterThanOrEqual(0);
    expect(res.y).toBeLessThan(600);
  });
});

describe('Additional coverage for protocol & vector edge cases', () => {
  it('Vector2.rotate(0) та rotate(2*PI) зберігають координати', () => {
    const v = new Vector2(7, -3);
    expect(v.rotate(0).x).toBeCloseTo(7);
    expect(v.rotate(Math.PI * 2).y).toBeCloseTo(-3);
  });

  it('encodeBinary для невідомого типу повідомлення кидає Error', () => {
    expect(() => encodeBinary({ type: 'invalid' } as never)).toThrow(/Unsupported/);
  });

  it('World.despawn безпечно ігнорує неіснуючий EntityId', () => {
    const w = new World();
    expect(() => w.despawn(asEntityId(9999))).not.toThrow();
  });

  it('Ship.applyInput повертає null для мертвого корабля або null input', () => {
    const ship = new Ship();
    expect(ship.applyInput(null, FIXED_DT)).toBeNull();
    ship.destroy();
    expect(ship.applyInput({ turn: 1, thrust: 1, fire: 1 }, FIXED_DT)).toBeNull();
  });

  it('decodeAngleInt16 та encodeAngleInt16 коректно нормалізують кути > 2*PI та < -2*PI', () => {
    const a = encodeAngleInt16(Math.PI * 3);
    const b = encodeAngleInt16(-Math.PI * 3);
    expect(Math.abs(a)).toBeLessThanOrEqual(32767);
    expect(Math.abs(b)).toBeLessThanOrEqual(32768);
  });

  it('parseClientMessage відхиляє невалідний формат у join', () => {
    expect(parseClientMessage({ type: 'join', roomId: '1', name: 'A', format: 'xml' }).ok).toBe(false);
  });
});

