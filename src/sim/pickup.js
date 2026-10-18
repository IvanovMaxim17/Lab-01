
import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Pickup extends Entity {
  constructor({
    pos = new Vector2(),
    type = 'shield',
    radius = 12,
    duration = 5,
  } = {}) {
    super({
      pos,
      vel: new Vector2(),
      radius,
      kind: 'pickup',
    });

    this.type = type;
    this.duration = duration;
  }

  applyTo(ship) {
    if (!ship || !ship.alive) return;

    switch (this.type) {
      case 'shield':
        ship.invulnerable = true;
        ship.shieldTime = this.duration;
        break;

      case 'rapid-fire':
        ship.rapidFireTime = this.duration;
        break;

      default:
        return;
    }

    this.destroy();
  }
}
