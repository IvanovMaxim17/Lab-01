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

  if (input.isDown('KeyA')) {
    ship.angle -= rotationSpeed * dt
  }

  if (input.isDown('KeyD')) {
    ship.angle += rotationSpeed * dt
  }

  if (input.isDown('KeyW')) {
    ship.thrust = 1
    ship.thrustTime += dt

    ship.vx += Math.cos(ship.angle) * acceleration * dt
    ship.vy += Math.sin(ship.angle) * acceleration * dt
  } else {
    ship.thrust = 0
    ship.thrustTime = 0
  }

  ship.vx *= drag
  ship.vy *= drag

  const speed = Math.sqrt(
    ship.vx * ship.vx +
    ship.vy * ship.vy,
  )

  if (speed > maxSpeed) {
    const scale = maxSpeed / speed

    ship.vx *= scale
    ship.vy *= scale
  }

  ship.x += ship.vx * dt
  ship.y += ship.vy * dt
}