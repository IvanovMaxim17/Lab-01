import { performance } from 'node:perf_hooks';
import { World, Ship, Vector2, FIXED_DT, Entity } from '../shared/dist/index.js';

function benchWorld(useSpatialHash, asteroids = 120, bullets = 180, ticks = 300) {
  Entity.resetIds(1);
  const world = new World({ width: 1600, height: 1200, seed: 42, useSpatialHash });
  world.spawnAsteroids(asteroids);
  const ship = world.spawn(new Ship({ pos: new Vector2(800, 600) }));

  const samples = [];
  for (let t = 0; t < ticks; t++) {
    if (t % 2 === 0 && [...world.ofKind('bullet')].length < bullets) {
      const b = ship.fire();
      world.spawn(b);
      ship.angle += 0.25;
    }
    const t0 = performance.now();
    world.step(FIXED_DT);
    samples.push(performance.now() - t0);
  }

  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.5)] ?? 0;
  const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
  const p99 = samples[Math.floor(samples.length * 0.99)] ?? 0;
  return {
    mode: useSpatialHash ? 'SpatialHash O(n)' : 'BruteForce O(n^2)',
    p50Ms: Number(p50.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    p99Ms: Number(p99.toFixed(3)),
  };
}

console.log('=== SERVER COLLISION BENCHMARK (120 asteroids + 180 bullets, 300 ticks) ===');
console.table([benchWorld(false), benchWorld(true)]);
