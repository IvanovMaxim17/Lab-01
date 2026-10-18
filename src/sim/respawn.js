
import { Vector2 } from './vector.js';
import { Ship } from './ship.js';

export class RespawnSystem {
  constructor({ delay = 2, safeDistance = 100 } = {}) {
    this.delay = delay;
    this.safeDistance = safeDistance;
    this.timer = null;
  }

  update(dt, world) {
    const ships = [...world.ofKind('ship')];

    if (ships.some((ship) => ship.alive)) {
      this.timer = null;
      return;
    }

    if (this.timer === null) {
      this.timer = this.delay;
    }

    this.timer -= dt;

    if (this.timer > 0) return;

    const pos = this.#findSafePosition(world);
    world.spawn(new Ship({ pos }));
    this.timer = null;
  }

  #findSafePosition(world) {
    const margin = 40;

    for (let attempt = 0; attempt < 30; attempt++) {
      const pos = new Vector2(
        margin + Math.random() * Math.max(1, world.width - margin * 2),
        margin + Math.random() * Math.max(1, world.height - margin * 2),
      );

      const safe = [...world.ofKind('asteroid')].every(
        (asteroid) =>
          asteroid.pos.sub(pos).length() >=
          asteroid.radius + this.safeDistance,
      );

      if (safe) return pos;
    }

    return new Vector2(world.width / 2, world.height / 2);
  }
}
