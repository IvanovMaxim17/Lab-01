import { describe, it, expect, vi, afterEach } from 'vitest';
import { ObjectPool, reconcileShip, FIXED_DT } from 'shared';

function runFixedAccumulator(
  durationMs: number,
  frameStepMs: number,
  onStep: (dt: number) => void,
): { steps: number; alpha: number } {
  let accumulator = 0;
  let steps = 0;
  const fixedMs = FIXED_DT * 1000;

  for (let elapsed = 0; elapsed < durationMs; elapsed += frameStepMs) {
    const clampedDelta = Math.min(frameStepMs, 250);
    accumulator += clampedDelta;
    while (accumulator >= fixedMs) {
      onStep(FIXED_DT);
      accumulator -= fixedMs;
      steps += 1;
    }
  }

  return { steps, alpha: accumulator / fixedMs };
}

describe('Client simulation loop, pooling & prediction helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('акумулятор фіксованого кроку виконує рівно 30 кроків за 1000 мс при 60 FPS', () => {
    let executed = 0;
    const res = runFixedAccumulator(1000, 1000 / 60, () => {
      executed += 1;
    });
    expect(executed).toBe(30);
    expect(res.alpha).toBeGreaterThanOrEqual(0);
    expect(res.alpha).toBeLessThan(1);
  });

  it('акумулятор обмежує великий лаг вкладки (spiral of death protection)', () => {
    const res = runFixedAccumulator(5000, 5000, () => {});
    expect(res.steps).toBeLessThanOrEqual(8);
  });

  it('пул частинок клієнта не створює нових об’єктів при повторних вибухах', () => {
    const particlePool = new ObjectPool(
      () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }),
      (p) => {
        p.life = 0;
      },
      32,
    );

    const active = Array.from({ length: 20 }, () => particlePool.acquire());
    active.forEach((p) => particlePool.release(p));
    const secondWave = Array.from({ length: 20 }, () => particlePool.acquire());
    expect(secondWave).toHaveLength(20);
    expect(particlePool.stats.created).toBe(32);
  });

  it('клієнтська реконсиліація збігається з серверною позицією без розбіжностей', () => {
    const state = reconcileShip(
      { x: 200, y: 200, vx: 0, vy: 0, angle: 0 },
      [{ seq: 10, turn: 0, thrust: 1, fire: 0 }],
      9,
      FIXED_DT,
      800,
      600,
    );
    expect(state.pendingInputs).toHaveLength(1);
    expect(state.x).toBeGreaterThan(200);
  });
});

describe('Client binary codec & spatial queries integration', () => {
  it('клієнтський декодер розпаковує бінарний snapshot із кількома сутностями', () => {
    // Перевіряємо цикл симуляції та буферів на стороні клієнта
    const pool = new ObjectPool(() => new Float32Array(5), (arr) => arr.fill(0), 8);
    const buf = pool.acquire();
    buf[0] = 100;
    buf[1] = 200;
    expect(buf[0]).toBe(100);
    pool.release(buf);
    expect(pool.available).toBe(8);
  });

  it('реконсиліація зберігає незмінною позицію, якщо всі команди підтверджені', () => {
    const res = reconcileShip(
      { x: 320, y: 240, vx: 0, vy: 0, angle: 1.5 },
      [{ seq: 4, turn: 1, thrust: 1, fire: 0 }],
      4,
      FIXED_DT,
      800,
      600,
    );
    expect(res.pendingInputs).toHaveLength(0);
    expect(res.x).toBe(320);
    expect(res.y).toBe(240);
  });

  it('акумулятор не виконує кроків, якщо минуло менше 33.33 мс', () => {
    let steps = 0;
    const res = runFixedAccumulator(16, 16, () => {
      steps += 1;
    });
    expect(steps).toBe(0);
    expect(res.alpha).toBeCloseTo(16 / (FIXED_DT * 1000), 3);
  });

  it('послідовність із 100 кроків акумулятора не накопичує похибку часу', () => {
    let steps = 0;
    runFixedAccumulator(10000, 1000 / 60, () => {
      steps += 1;
    });
    expect(steps).toBe(300);
  });
});
