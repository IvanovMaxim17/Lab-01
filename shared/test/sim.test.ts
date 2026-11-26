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
  decodeBinary,
  encodeMessage,
  decodeMessage,
  encodeAngleInt16,
  decodeAngleInt16,
  clampInput,
  parseClientMessage,
  asEntityId,
  asPlayerId,
  asSeq,
  asTick,
  PROTOCOL_VERSION,
} from '../src/index.js';

describe('Vector2', () => {
  it('створює нульовий вектор за замовчуванням', () => {
    const v = new Vector2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('додає та віднімає вектори без мутації оригіналу', () => {
    const a = new Vector2(3, 4);
    const b = new Vector2(1, -2);
    expect(a.add(b)).toEqual(new Vector2(4, 2));
    expect(a.sub(b)).toEqual(new Vector2(2, 6));
    expect(a.x).toBe(3);
  });

  it('масштабує та обчислює довжину', () => {
    const v = new Vector2(3, 4);
    expect(v.length()).toBe(5);
    expect(v.scale(2)).toEqual(new Vector2(6, 8));
  });

  it('нормалізує ненульовий і нульовий вектори безпечно', () => {
    const norm = new Vector2(0, 5).normalize();
    expect(norm.x).toBeCloseTo(0);
    expect(norm.y).toBeCloseTo(1);
    expect(new Vector2(0, 0).normalize()).toEqual(new Vector2(0, 0));
  });

  it('повертає вектор на заданий кут і рахує скалярний добуток', () => {
    const rotated = new Vector2(1, 0).rotate(Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(1);
    expect(new Vector2(2, 3).dot(new Vector2(4, -1))).toBe(5);
  });

  it('будує одиничний вектор з кута fromAngle', () => {
    const v = Vector2.fromAngle(Math.PI);
    expect(v.x).toBeCloseTo(-1);
    expect(v.y).toBeCloseTo(0);
  });
});

describe('Entities: Ship, Bullet, Asteroid', () => {
  beforeEach(() => {
    Entity.resetIds(1);
  });

  it('Ship повертається, прискорюється і стріляє з урахуванням cooldown', () => {
    const ship = new Ship({ playerId: asPlayerId(7), pos: new Vector2(100, 100), angle: 0 });
    const b1 = ship.applyInput({ turn: 1, thrust: 1, fire: 1 }, FIXED_DT);
    expect(b1).toBeInstanceOf(Bullet);
    expect(ship.angle).toBeGreaterThan(0);
    expect(ship.vel.x).toBeGreaterThan(0);
    expect(ship.thrust).toBe(1);

    // Повторний постріл одразу на наступному тіку блокується cooldown
    const b2 = ship.applyInput({ turn: 0, thrust: 0, fire: 1 }, FIXED_DT);
    expect(b2).toBeNull();
  });

  it('Ship ігнорує шкоду під щитом і знищується при hp <= 0', () => {
    const ship = new Ship({ hp: 2, invulnerable: true, shieldTime: 0.5 });
    ship.takeDamage(5);
    expect(ship.hp).toBe(2);
    expect(ship.alive).toBe(true);

    ship.update(0.6);
    expect(ship.invulnerable).toBe(false);
    ship.takeDamage(2);
    expect(ship.hp).toBe(0);
    expect(ship.alive).toBe(false);
  });

  it('Ship і Bullet коректно серіалізуються у знімок і відновлюються', () => {
    const ship = new Ship({
      id: asEntityId(10),
      playerId: asPlayerId(3),
      name: 'Ace',
      pos: new Vector2(50, 60),
      vel: new Vector2(10, -5),
      angle: 1.2,
      hp: 2,
      score: 150,
      thrust: 1,
    });
    const restoredShip = Ship.fromSnapshot(ship.toSnapshot());
    expect(restoredShip.id).toBe(ship.id);
    expect(restoredShip.name).toBe('Ace');
    expect(restoredShip.score).toBe(150);

    const bullet = ship.fire();
    const restoredBullet = Bullet.fromSnapshot(bullet.toSnapshot());
    expect(restoredBullet.ownerId).toBe(ship.id);
    expect(restoredBullet.pos.x).toBeCloseTo(bullet.pos.x);
  });

  it('Bullet зникає після завершення TTL', () => {
    const bullet = new Bullet({ ttl: 0.05 });
    bullet.update(0.03);
    expect(bullet.alive).toBe(true);
    bullet.update(0.03);
    expect(bullet.alive).toBe(false);
  });

  it('Asteroid відбивається від меж світу', () => {
    const ast = new Asteroid({
      pos: new Vector2(15, 300),
      vel: new Vector2(-50, 0),
      radius: 20,
    });
    ast.update(FIXED_DT, { width: 800, height: 600 });
    expect(ast.pos.x).toBe(20);
    expect(ast.vel.x).toBeGreaterThan(0);
  });
});

describe('World simulation & collisions', () => {
  beforeEach(() => {
    Entity.resetIds(1);
  });

  it('детермінованість: однаковий seed дає ідентичний стан через 120 тіків', () => {
    const run = () => {
      Entity.resetIds(1);
      const world = new World({ width: 800, height: 600, seed: 424242 });
      world.spawnAsteroids(10);
      const ship = world.spawn(new Ship({ pos: new Vector2(400, 300) }));
      for (let t = 0; t < 120; t++) {
        const b = ship.applyInput({ turn: t % 3 === 0 ? 1 : 0, thrust: 1, fire: t % 15 === 0 ? 1 : 0 }, FIXED_DT);
        if (b) world.spawn(b);
        world.step(FIXED_DT);
      }
      return [...world].map((e) => e.toSnapshot());
    };

    expect(run()).toEqual(run());
  });

  it('колізії: дотик, перетин і промах кулі по астероїду', () => {
    // 1. Перетин — влучання
    const wHit = new World({ width: 800, height: 600, seed: 1 });
    const shooter = wHit.spawn(new Ship({ pos: new Vector2(100, 100) }));
    wHit.spawn(new Asteroid({ pos: new Vector2(200, 200), vel: new Vector2(0, 0), radius: 20 }));
    wHit.spawn(new Bullet({ pos: new Vector2(215, 200), vel: new Vector2(0, 0), radius: 3, ownerId: shooter.id }));
    wHit.step(FIXED_DT);
    expect(shooter.score).toBe(25);
    expect(wHit.drainEvents().some((e) => e.type === 'hit')).toBe(true);

    // 2. Промах — відстань більша за суму радіусів
    const wMiss = new World({ width: 800, height: 600, seed: 1 });
    wMiss.spawn(new Asteroid({ pos: new Vector2(200, 200), vel: new Vector2(0, 0), radius: 20 }));
    wMiss.spawn(new Bullet({ pos: new Vector2(230, 200), vel: new Vector2(0, 0), radius: 3 }));
    wMiss.step(FIXED_DT);
    expect(wMiss.drainEvents()).toHaveLength(0);
  });

  it('wrap-around утримує корабель та кулі в межах арени', () => {
    const world = new World({ width: 800, height: 600, seed: 1 });
    const ship = world.spawn(new Ship({ pos: new Vector2(799, 599), vel: new Vector2(120, 120) }));
    world.step(FIXED_DT);
    expect(ship.pos.x).toBeGreaterThanOrEqual(0);
    expect(ship.pos.x).toBeLessThan(800);
    expect(ship.pos.y).toBeGreaterThanOrEqual(0);
    expect(ship.pos.y).toBeLessThan(600);
  });

  it('SpatialHash і brute-force дають ідентичний результат колізій', () => {
    const simulate = (useSpatialHash: boolean) => {
      Entity.resetIds(1);
      const w = new World({ width: 800, height: 600, seed: 99, useSpatialHash });
      w.spawnAsteroids(15);
      const s = w.spawn(new Ship({ pos: new Vector2(400, 300) }));
      for (let i = 0; i < 60; i++) {
        const b = s.applyInput({ turn: 1, thrust: 1, fire: 1 }, FIXED_DT);
        if (b) w.spawn(b);
        w.step(FIXED_DT);
      }
      return { score: s.score, count: [...w].length };
    };

    expect(simulate(true)).toEqual(simulate(false));
  });
});

describe('ObjectPool, SpatialHash & reconcileShip', () => {
  it('ObjectPool повторно використовує звільнені об’єкти без нових алокацій', () => {
    const pool = new ObjectPool(() => ({ x: 0, active: false }), (o) => {
      o.x = 0;
      o.active = false;
    }, 2);

    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.available).toBe(0);
    pool.release(a);
    expect(pool.available).toBe(1);
    const c = pool.acquire();
    expect(c).toBe(a);
    expect(pool.stats.created).toBe(2);
    pool.release(b);
    pool.release(c);
  });

  it('SpatialHash знаходить сусідів навіть через межу wrap-around', () => {
    const hash = new SpatialHash<{ id: number; pos: { x: number; y: number }; radius: number }>(800, 600, 80);
    hash.insert({ id: 1, pos: { x: 5, y: 10 }, radius: 10 });
    hash.insert({ id: 2, pos: { x: 400, y: 300 }, radius: 10 });

    const nearEdge = hash.query(795, 10, 20);
    expect(nearEdge.map((i) => i.id)).toContain(1);
    expect(nearEdge.map((i) => i.id)).not.toContain(2);
  });

  it('reconcileShip відкидає підтверджені seq і перепрограє непідтверджені команди', () => {
    const result = reconcileShip(
      { x: 100, y: 100, vx: 0, vy: 0, angle: 0 },
      [
        { seq: 1, turn: 0, thrust: 1, fire: 0 },
        { seq: 2, turn: 0, thrust: 1, fire: 0 },
        { seq: 3, turn: 1, thrust: 1, fire: 0 },
      ],
      1,
      FIXED_DT,
      800,
      600,
    );

    expect(result.pendingInputs.map((c) => c.seq)).toEqual([2, 3]);
    expect(result.x).toBeGreaterThan(100);
    expect(result.angle).toBeGreaterThan(0);
  });
});

describe('Codec & Protocol unit + property-based tests (fast-check)', () => {
  it('clampInput обмежує turn до {-1, 0, 1} і нормалізує прапорці', () => {
    expect(clampInput({ turn: 99, thrust: true, fire: 0, seq: 5, tick: 10 })).toEqual({
      seq: asSeq(5),
      tick: asTick(10),
      turn: 1,
      thrust: 1,
      fire: 0,
    });
  });

  it('decodeBinary відхиляє невірну версію протоколу та короткі буфери', () => {
    const badVersion = new Uint8Array([PROTOCOL_VERSION + 1, 1, 0, 0]);
    expect(() => decodeBinary(badVersion)).toThrow(/version/i);
    expect(() => decodeBinary(new Uint8Array([1]))).toThrow(/short/i);
  });

  it('[Property 1] бінарний round-trip INPUT та SNAPSHOT зберігає дані в межах допуску квантування', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom(-1 as const, 0 as const, 1 as const),
        fc.constantFrom(0 as const, 1 as const),
        fc.constantFrom(0 as const, 1 as const),
        fc.float({ min: Math.fround(-Math.PI), max: Math.fround(Math.PI), noNaN: true }),
        (seq, tick, turn, thrust, fire, angle) => {
          const decodedInput = decodeBinary(
            encodeBinary({ type: 'input', seq: asSeq(seq), tick: asTick(tick), turn, thrust, fire }),
          );
          expect(decodedInput).toEqual({
            type: 'input',
            seq: asSeq(seq),
            tick: asTick(tick),
            turn,
            thrust,
            fire,
          });

          const snap = decodeBinary(
            encodeBinary({
              type: 'snapshot',
              tick: asTick(tick),
              lastProcessedSeq: asSeq(seq),
              yourShipId: asEntityId(1),
              entities: [{ kind: 'ship', id: asEntityId(1), x: 120.5, y: 240.25, vx: 10, vy: -5, angle, radius: 15, hp: 3, score: 50, thrust, invulnerable: 0 }],
            }),
          );
          expect(snap.type).toBe('snapshot');
          if (snap.type === 'snapshot') {
            expect(snap.entities).toHaveLength(1);
            const ent = snap.entities[0]!;
            expect(Math.abs(decodeAngleInt16(encodeAngleInt16(angle)) - ent.angle)).toBeLessThan(0.002);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('[Property 2] розмір бінарного буфера точно відповідає специфікації протоколу', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 25 }),
        fc.double({ min: 0, max: 1e12, noNaN: true }),
        (entityCount, clientTime) => {
          const inputBuf = encodeBinary({ type: 'input', seq: 1, tick: 1, turn: 0, thrust: 0, fire: 0 });
          expect(inputBuf.byteLength).toBe(13);

          const pingBuf = encodeBinary({ type: 'ping', clientTime });
          expect(pingBuf.byteLength).toBe(10);

          const entities = Array.from({ length: entityCount }, (_, i) => ({
            kind: 'asteroid' as const,
            id: asEntityId(i + 1),
            x: i * 10,
            y: i * 5,
            radius: 20,
          }));
          const snapBuf = encodeBinary({ type: 'snapshot', tick: 1, entities });
          expect(snapBuf.byteLength).toBe(16 + entityCount * 27);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('[Property 3] довільні биті байти у decodeBinary кидають лише типізований Error, без падіння процесу', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 128 }), (bytes) => {
        try {
          const msg = decodeBinary(bytes);
          expect(typeof msg.type).toBe('string');
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('[Property 4] корабель залишається строго в межах арени за 1000 випадкових кроків', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            turn: fc.constantFrom(-1 as const, 0 as const, 1 as const),
            thrust: fc.constantFrom(0 as const, 1 as const),
          }),
          { minLength: 1000, maxLength: 1000 },
        ),
        (inputs) => {
          const world = new World({ width: 800, height: 600, seed: 777 });
          const ship = world.spawn(new Ship({ pos: new Vector2(400, 300) }));
          for (const inp of inputs) {
            ship.applyInput({ turn: inp.turn, thrust: inp.thrust, fire: 0 }, FIXED_DT);
            world.step(FIXED_DT);
            expect(ship.pos.x).toBeGreaterThanOrEqual(0);
            expect(ship.pos.x).toBeLessThan(800);
            expect(ship.pos.y).toBeGreaterThanOrEqual(0);
            expect(ship.pos.y).toBeLessThan(600);
            expect(Number.isFinite(ship.pos.x)).toBe(true);
            expect(Number.isFinite(ship.pos.y)).toBe(true);
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it('[Property 5] parseClientMessage приймає кожне валідне повідомлення та відхиляє зіпсовані', () => {
    const validArb = fc.oneof(
      fc.record({
        type: fc.constant('join' as const),
        roomId: fc.string({ minLength: 1, maxLength: 20 }),
        name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        format: fc.constantFrom('binary' as const, 'json' as const),
      }),
      fc.record({
        type: fc.constant('input' as const),
        seq: fc.nat({ max: 100000 }),
        tick: fc.nat({ max: 100000 }),
        turn: fc.integer({ min: -1, max: 1 }),
        thrust: fc.constantFrom(0, 1, true, false),
        fire: fc.constantFrom(0, 1, true, false),
      }),
      fc.record({
        type: fc.constant('chat' as const),
        text: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      }),
      fc.record({ type: fc.constant('leave' as const) }),
    );

    fc.assert(
      fc.property(validArb, (msg) => {
        const okRes = parseClientMessage(msg);
        expect(okRes.ok).toBe(true);

        const broken = { ...msg, type: 'unknown_hack_packet' };
        const badRes = parseClientMessage(broken);
        expect(badRes.ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('encodeMessage/decodeMessage підтримують JSON формат', () => {
    const encoded = encodeMessage({ type: 'pong', clientTime: 12345 }, 'json');
    expect(typeof encoded).toBe('string');
    expect(decodeMessage(encoded)).toEqual({ type: 'pong', clientTime: 12345 });
  });
});
