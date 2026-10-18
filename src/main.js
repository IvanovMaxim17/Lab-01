import { emitGameEvent } from './events.js';
import { GameAudio } from './audio/audio.js';
import { loadGameAssets } from './assets/game-assets.js';
import { Lobby } from './lobby.js';
import { renderLobby } from './lobby-view.js';
function drawSpriteFrame(context, image, sx, sy, sw, sh, x, y, width, height, angle = 0) {
  if (!image) return;

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.drawImage(
    image,
    sx, sy, sw, sh,
    -width / 2, -height / 2, width, height,
  );
  context.restore();
}

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
title.textContent = 'SpaceFight РІР‚вЂќ Lab 02';

const hud = document.createElement('p');
const controls = document.createElement('p');
controls.textContent =
  'W = thrust | A/D = turn | Space = fire | H = homing shot';

app.append(title, hud, controls);

title.style.display = 'none';
hud.style.display = 'none';
controls.style.display = 'none';

const lobbyContainer = document.createElement('div');
app.append(lobbyContainer);

const input = createInput();
const canvas = createCanvas();
canvas.canvas.style.display = 'none';

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

// РђСЃС‚РµСЂРѕС—РґРё СЃС‚РІРѕСЂСЋСЋС‚СЊСЃСЏ РїС–СЃР»СЏ РІРёР±РѕСЂСѓ Р°СЂРµРЅРё РІ Lobby.

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
  emitGameEvent('fired', { bullet, ship: currentShip, homing });
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
        const bulletSprite = gameAssets?.sprites?.bullets;
        const bulletFrame = entity.ownerId % 2 === 0 ? 0 : 1;

        if (bulletSprite) {
          drawSpriteFrame(
            canvas.context,
            bulletSprite,
            bulletFrame * 16, 0, 16, 16,
            x, y,
            entity.radius * 3, entity.radius * 3,
            entity.angle ?? 0,
          );
        } else {
          canvas.context.fillStyle = '#ffe66d';
          canvas.context.beginPath();
          canvas.context.arc(x, y, entity.radius, 0, Math.PI * 2);
          canvas.context.fill();
        }
      } else if (entity.kind === 'asteroid') {
        const asteroidSprite = gameAssets?.sprites?.asteroids;
        const asteroidFrame = entity.id % 2 === 0 ? 0 : 1;

        if (asteroidSprite) {
          drawSpriteFrame(
            canvas.context,
            asteroidSprite,
            asteroidFrame * 40, 0, 40, 40,
            x, y,
            entity.radius * 2.5, entity.radius * 2.5,
            entity.angle ?? 0,
          );
        } else {
          canvas.context.strokeStyle = '#a8b3c7';
          canvas.context.lineWidth = 2;
          canvas.context.beginPath();
          canvas.context.arc(x, y, entity.radius, 0, Math.PI * 2);
          canvas.context.stroke();
        }
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

let gameAssets = null;
const gameAudio = new GameAudio();
let isLoadingGame = false;
let retryButton = null;
let loadingError = null;

async function unlockGameAudio() {
  try {
    await gameAudio.unlock();

    if (gameAudio.unlocked) {
      document.removeEventListener('pointerdown', unlockGameAudio);
      document.removeEventListener('keydown', unlockGameAudio);
    }
  } catch (error) {
    console.warn('РќРµ РІРґР°Р»РѕСЃСЏ Р°РєС‚РёРІСѓРІР°С‚Рё Р°СѓРґС–Рѕ:', error);
  }
}

document.addEventListener('pointerdown', unlockGameAudio);
document.addEventListener('keydown', unlockGameAudio);

async function startGame() {
  if (isLoadingGame) return;

  isLoadingGame = true;
  retryButton?.remove();
  retryButton = null;
  loadingError?.remove();
  loadingError = null;

  try {
    const assets = await loadGameAssets(canvas, gameAudio.context);
    gameAssets = assets;
    gameAudio.setBuffers(assets.audio);

    loop.start();
  } catch (error) {
    console.error('РџРѕРјРёР»РєР° Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РіСЂРё:', error);

    loadingError = document.createElement('p');
    loadingError.textContent =
      `РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё СЂРµСЃСѓСЂСЃРё: ${error.message}`;

    retryButton = document.createElement('button');
    retryButton.textContent = 'РЎРїСЂРѕР±СѓРІР°С‚Рё С‰Рµ СЂР°Р·';
    retryButton.addEventListener('click', startGame);

    app.append(loadingError, retryButton);
  } finally {
    isLoadingGame = false;
  }
}

async function initializeLobby() {
  const lobby = new Lobby();
  let lobbyView = null;
  let pollId = null;
  let joining = false;

  async function refreshLobby() {
    try {
      const rooms = await lobby.refresh();

      if (!lobbyContainer.isConnected || joining) return;

      if (!lobbyView) {
        lobbyView = renderLobby(
          lobbyContainer,
          rooms,
          joinLobby,
          refreshLobby,
        );
      } else {
        lobbyView.updateRooms(rooms);
      }

      lobbyView.setStatus(`Кімнат знайдено: ${rooms.length}`);
    } catch (error) {
      if (!lobbyContainer.isConnected || joining) return;

      if (!lobbyView) {
        lobbyView = renderLobby(
          lobbyContainer,
          [],
          joinLobby,
          refreshLobby,
        );
      }

      lobbyView.setStatus(`Помилка завантаження кімнат: ${error.message}`);
    }
  }

  async function joinLobby({ name, roomId }) {
    if (joining) return;
    joining = true;

    try {
      const room = lobby.join(roomId);

      lobby.cancel();
      clearInterval(pollId);

      lobbyContainer.remove();
      title.style.display = '';
      hud.style.display = '';
      controls.style.display = '';
      canvas.canvas.style.display = 'block';

      title.textContent = `SpaceFight — ${name} — ${room.name}`;

      for (const asteroid of [...world.ofKind('asteroid')]) {
        asteroid.destroy();
      }

      for (let i = 0; i < room.asteroidCount; i++) {
        spawnAsteroid();
      }

      await startGame();
    } catch (error) {
      joining = false;
      lobbyView?.setStatus(`Не вдалося увійти: ${error.message}`);
    }
  }

  await refreshLobby();

  if (lobbyContainer.isConnected) {
    pollId = setInterval(() => {
      void refreshLobby();
    }, 10000);
  }
}

initializeLobby();




