
import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { createCanvas } from './render/canvas.js';
import { drawBackground, drawShip } from './render/draw.js';

import { Vector2 } from './sim/vector.js';
import { Ship } from './sim/ship.js';
import { World } from './sim/world.js';
import { Asteroid } from './sim/asteroid.js';
import { Pickup } from './sim/pickup.js';
import { createExplosion } from './sim/particle.js';
import { RespawnSystem } from './sim/respawn.js';
import { HomingBehavior } from './sim/homing.js';

const app = document.querySelector('#app');
app.innerHTML = '';

const title = document.createElement('h1');
title.textContent = 'SpaceFight — Lab 02';

const hud = document.createElement('p');
const controls = document.createElement('p');
controls.textContent =
  'W = thrust | A/D = turn | Space = fire | H = homing shot';

app.append(title, hud, controls);

const input = createInput();
const canvas = createCanvas();

const world = new World({
  width: canvas.width,
  height: canvas.height,
});

const ship = world.spawn(
  new Ship({
    pos: new Vector2(canvas.width / 2, canvas.height / 2),
  }),
);

const respawnSystem = new RespawnSystem();

let previousPositions = new Map();
let totalSteps = 0;
let frames = 0;
let lastMetricsTime = performance.now();
let stepsPerSecond = 0;
let framesPerSecond = 0;

let experimentBusyWait = false;
let experimentFrameTime = 0;

function busyWait(milliseconds) {
  const end = performance.now() + milliseconds;

  while (performance.now() < end) {
    // Intentionally block the main thread.
  }
}

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

function lerpAngle(a, b, alpha) {
  let difference = b - a;

  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;

  return a + difference * alpha;
}

function spawnAsteroid() {
  const margin = 40;
  const pos = new Vector2(
    margin + Math.random() * Math.max(1, world.width - margin * 2),
    margin + Math.random() * Math.max(1, world.height - margin * 2),
  );

  const angle = Math.random() * Math.PI * 2;
  const speed = 30 + Math.random() * 60;

  world.spawn(
    new Asteroid({
      pos,
      vel: Vector2.fromAngle(angle).scale(speed),
      radius: 18 + Math.random() * 16,
    }),
  );
}

for (let i = 0; i < 6; i++) {
  spawnAsteroid();
}

world.spawn(
  new Pickup({
    pos: new Vector2(canvas.width * 0.25, canvas.height * 0.25),
    type: 'shield',
  }),
);

function fireBullet(homing = false) {
  const currentShip = [...world.ofKind('ship')][0];
  if (!currentShip) return;

  const bullet = currentShip.fire();

  if (homing) {
    bullet.addBehavior(new HomingBehavior());
  }

  world.spawn(bullet);
}

const loop = createLoop({
  simulate(dt) {
    const ships = [...world.ofKind('ship')];

    for (const currentShip of ships) {
      if (input.isDown('KeyA')) currentShip.angle -= 3 * dt;
      if (input.isDown('KeyD')) currentShip.angle += 3 * dt;

      if (input.isDown('KeyW')) {
        const direction = Vector2.fromAngle(currentShip.angle);
        currentShip.vel = currentShip.vel.add(
          direction.scale(180 * dt),
        );
        currentShip.thrust = 1;
        currentShip.thrustTime += dt;
      } else {
        currentShip.thrust = 0;
        currentShip.thrustTime = 0;
      }

      if (input.justPressed('Space')) {
        fireBullet();
      }

      if (input.justPressed('KeyH')) {
        fireBullet(true);
      }
    }

    previousPositions = new Map();

    for (const entity of world) {
      previousPositions.set(entity.id, {
        x: entity.pos.x,
        y: entity.pos.y,
        angle: entity.angle,
      });
    }

    world.width = canvas.width;
    world.height = canvas.height;
    world.step(dt);
    respawnSystem.update(dt, world);

    for (const entity of [...world]) {
      if (
        entity.kind === 'pickup' &&
        [...world.ofKind('ship')].some(
          (currentShip) =>
            currentShip.pos.sub(entity.pos).length() <
            currentShip.radius + entity.radius,
        )
      ) {
        entity.applyTo([...world.ofKind('ship')][0]);
      }
    }

    totalSteps++;
  },

  render(alpha, steps, frameTime) {
    frames++;

    if (experimentBusyWait && totalSteps % 60 === 0) {
      const start = performance.now();
      busyWait(100);
      experimentFrameTime = performance.now() - start;
    }

    const now = performance.now();

    if (now - lastMetricsTime >= 1000) {
      stepsPerSecond = totalSteps;
      framesPerSecond = frames;
      totalSteps = 0;
      frames = 0;
      lastMetricsTime = now;
    }

    hud.textContent =
      `Steps/s: ${stepsPerSecond} | Frames/s: ${framesPerSecond}` +
      ` | Frame time: ${frameTime.toFixed(2)} ms` +
      ` | Busy wait: ${experimentFrameTime.toFixed(0)} ms` +
      ` | Score: ${[...world.ofKind('ship')].reduce((sum, s) => sum + s.score, 0)}`;

    drawBackground(canvas.context, canvas.width, canvas.height);

    for (const entity of world) {
      const previous = previousPositions.get(entity.id);
      const x = previous ? lerp(previous.x, entity.pos.x, alpha) : entity.pos.x;
      const y = previous ? lerp(previous.y, entity.pos.y, alpha) : entity.pos.y;

      if (entity.kind === 'ship') {
        drawShip(canvas.context, {
          x,
          y,
          angle: previous
            ? lerpAngle(previous.angle, entity.angle, alpha)
            : entity.angle,
          thrust: entity.thrust ?? 0,
          thrustTime: entity.thrustTime ?? 0,
        });
      } else if (entity.kind === 'bullet') {
        canvas.context.fillStyle = '#ffe66d';
        canvas.context.beginPath();
        canvas.context.arc(x, y, entity.radius, 0, Math.PI * 2);
        canvas.context.fill();
      } else if (entity.kind === 'asteroid') {
        canvas.context.strokeStyle = '#a8b3c7';
        canvas.context.lineWidth = 2;
        canvas.context.beginPath();
        canvas.context.arc(x, y, entity.radius, 0, Math.PI * 2);
        canvas.context.stroke();
      } else if (entity.kind === 'pickup') {
        canvas.context.fillStyle =
          entity.type === 'shield' ? '#54b9ff' : '#7dff8a';
        canvas.context.beginPath();
        canvas.context.arc(x, y, entity.radius, 0, Math.PI * 2);
        canvas.context.fill();
      } else if (entity.kind === 'particle') {
        canvas.context.globalAlpha = entity.alpha;
        canvas.context.fillStyle = entity.color;
        canvas.context.beginPath();
        canvas.context.arc(x, y, entity.radius, 0, Math.PI * 2);
        canvas.context.fill();
        canvas.context.globalAlpha = 1;
      }
    }
  },
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'F8') {
    experimentBusyWait = !experimentBusyWait;
  }

  if (event.code === 'KeyE') {
    const currentShip = [...world.ofKind('ship')][0];

    if (currentShip) {
      for (const particle of createExplosion(currentShip.pos)) {
        world.spawn(particle);
      }
    }
  }
});

loop.start();
