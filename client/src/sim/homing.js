
import { Vector2 } from './vector.js';

export class HomingBehavior {
  constructor({ turnRate = 3, speed = 250 } = {}) {
    this.turnRate = turnRate;
    this.speed = speed;
  }

  update(entity, dt, world) {
    if (!world || !entity.alive) return;

    let target = null;
    let nearestDistance = Infinity;

    for (const candidate of world) {
      if (
        !candidate.alive ||
        candidate.id === entity.id ||
        candidate.id === entity.ownerId ||
        candidate.kind !== 'asteroid'
      ) {
        continue;
      }

      const distance = candidate.pos.sub(entity.pos).length();

      if (distance < nearestDistance) {
        nearestDistance = distance;
        target = candidate;
      }
    }

    if (!target) return;

    const desired = target.pos.sub(entity.pos).normalize();
    const current = entity.vel.normalize();

    if (current.length() === 0) {
      entity.vel = desired.scale(this.speed);
      entity.angle = Math.atan2(desired.y, desired.x);
      return;
    }

    let difference = Math.atan2(
      current.x * desired.y - current.y * desired.x,
      current.dot(desired),
    );

    const maxTurn = this.turnRate * dt;
    difference = Math.max(-maxTurn, Math.min(maxTurn, difference));

    const newDirection = current.rotate(difference);

    entity.vel = newDirection.scale(this.speed);
    entity.angle = Math.atan2(newDirection.y, newDirection.x);
  }
}
