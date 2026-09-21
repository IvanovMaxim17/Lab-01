export function createShip() {
  return {
    x: 400,
    y: 300,
    vx: 0,
    vy: 0,
    angle: 0,
    thrust: 0,
    thrustTime: 0,
  }
}

export function integrate(ship, input, dt) {
  const rotationSpeed = 3
  const acceleration = ship.thrustTime > 2 ? 400 : 200
  const drag = 0.99
  const maxSpeed = ship.thrustTime > 2 ? 1000 : 500

  let angle = ship.angle
  let vx = ship.vx
  let vy = ship.vy
  let thrust = 0
  let thrustTime = 0

  if (input.isDown('KeyA')) {
    angle -= rotationSpeed * dt
  }

  if (input.isDown('KeyD')) {
    angle += rotationSpeed * dt
  }

  if (input.isDown('KeyW')) {
    thrust = 1
    thrustTime = ship.thrustTime + dt

    vx += Math.cos(angle) * acceleration * dt
    vy += Math.sin(angle) * acceleration * dt
  }

  vx *= drag
  vy *= drag

  const speed = Math.sqrt(vx * vx + vy * vy)

  if (speed > maxSpeed) {
    const scale = maxSpeed / speed

    vx *= scale
    vy *= scale
  }

  return {
    ...ship,
    angle,
    vx,
    vy,
    thrust,
    thrustTime,
    x: ship.x + vx * dt,
    y: ship.y + vy * dt,
  }
}
