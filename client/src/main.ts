import {
  Vector2,
  Ship,
  FIXED_DT,
  TICK_RATE,
  encodeMessage,
  decodeMessage,
  type BinaryFlag,
  type EntityId,
  type MessageFormat,
  type SnapshotMessage,
  type Tick,
  type TurnDirection,
  type WireAsteroidSnapshot,
  type WireBulletSnapshot,
  type WireEntitySnapshot,
  type WireMessage,
  type WireShipSnapshot,
  type WorldEvent,
} from 'shared';
import { emitGameEvent } from './events.js';
import { GameAudio } from './audio/audio.js';
import { loadGameAssets } from './assets/game-assets.js';
import type { LoadedAssets } from './assets/loader.js';
import { Lobby, type LobbyRoom } from './lobby.js';
import { renderLobby, type JoinSubmission, type LobbyViewController } from './lobby-view.js';
import { Connection } from './connection.js';
import { createChatView } from './chat-view.js';
import { createInput } from './input.js';
import { createCanvas } from './render/canvas.js';
import { drawBackground, drawShip } from './render/draw.js';
import { createExplosion, type Particle } from './sim/particle.js';

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const INTERP_DELAY_MS = 85;

interface PendingCommand {
  readonly seq: number;
  readonly turn: TurnDirection;
  readonly thrust: BinaryFlag;
  readonly fire: BinaryFlag;
}

interface SnapshotEntry {
  readonly receivedAt: number;
  readonly tick: Tick;
  readonly entities: readonly WireEntitySnapshot[];
}

interface PredictedPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

interface RenderableShip extends WireShipSnapshot {
  readonly thrustTime?: number;
  readonly isLocal?: boolean;
}

type RenderableEntity =
  | RenderableShip
  | WireBulletSnapshot
  | WireAsteroidSnapshot;

interface JoinedServerMessage {
  readonly type: 'joined';
  readonly room: LobbyRoom & { readonly playersCount: number };
  readonly playerName: string;
  readonly playerId: number;
  readonly shipId?: EntityId;
  readonly tickRate: number;
  readonly format: MessageFormat;
}

interface EventsServerMessage {
  readonly type: 'events';
  readonly tick: number;
  readonly events?: readonly WorldEvent[];
}

interface ChatServerMessage {
  readonly type: 'chat';
  readonly name: string;
  readonly text: string;
  readonly time?: string;
}

interface FormatChangedServerMessage {
  readonly type: 'formatChanged';
  readonly format: MessageFormat;
}

type ServerMessage =
  | WireMessage
  | JoinedServerMessage
  | EventsServerMessage
  | ChatServerMessage
  | FormatChangedServerMessage;

function toServerMessage(msg: WireMessage): ServerMessage {
  return msg;
}

function drawSpriteFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle = 0,
): void {
  if (!image) return;

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    -width / 2,
    -height / 2,
    width,
    height,
  );
  context.restore();
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function lerpAngle(a: number, b: number, alpha: number): number {
  let difference = b - a;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return a + difference * alpha;
}

function wrapCoord(val: number, max: number): number {
  return ((val % max) + max) % max;
}

function shortestWrappedDelta(from: number, to: number, max: number): number {
  let d = to - from;
  if (d > max / 2) d -= max;
  if (d < -max / 2) d += max;
  return d;
}

const rawApp = document.querySelector<HTMLElement>('#app');
if (!rawApp) {
  throw new Error('Root #app container not found');
}
const app: HTMLElement = rawApp;
app.innerHTML = '';

const APP_VERSION = typeof import.meta.env.VITE_APP_VERSION === 'string' && import.meta.env.VITE_APP_VERSION.length > 0 ? import.meta.env.VITE_APP_VERSION : 'v1.0.0';
const title = document.createElement('h1');
title.textContent = `SpaceFight — Multiplayer (${APP_VERSION})`;

const hud = document.createElement('p');
const controls = document.createElement('p');
controls.textContent =
  'W / ↑ = тяга | A/D або ←/→ = поворот | Space = постріл | F9 = Netgraph';

app.append(title, hud, controls);
title.style.display = 'none';
hud.style.display = 'none';
controls.style.display = 'none';

const lobbyContainer = document.createElement('div');
app.append(lobbyContainer);

const input = createInput();
const canvas = createCanvas();
canvas.canvas.width = WORLD_WIDTH;
canvas.canvas.height = WORLD_HEIGHT;
canvas.canvas.style.display = 'none';

const localParticles: Particle[] = [];

function spawnExplosionAt(
  x: number,
  y: number,
  count = 20,
  speed = 150,
  color = '#ff9933',
): void {
  const created = createExplosion(new Vector2(x, y), { count, speed, color });
  localParticles.push(...created);
}

let activeConnection: Connection | null = null;
let protocolFormat: MessageFormat = 'binary';
let myShipId: number = 0;
let myPlayerName = '';
let latestServerTick = 0;
let lastSnapshotReceivedAt = 0;

let predictedShip: Ship | null = null;
let prevPredictedPos: PredictedPose | null = null;
let visualOffsetX = 0;
let visualOffsetY = 0;
let inputSeq = 0;
let pendingInputs: PendingCommand[] = [];

const snapshotBuffer: SnapshotEntry[] = [];
const MAX_SNAPSHOT_BUFFER = 30;
const playerNamesByShipId = new Map<number, string>();

let rttMs = 0;
let lastCorrectionPx = 0;
let avgCorrectionPx = 0;
let framesCount = 0;
let fps = 0;
let lastFpsTime = performance.now();
let netgraphVisible = true;
let activeNetPreset: 'ideal' | 'med' | 'bad' = 'ideal';

const netgraphPanel = document.createElement('div');
Object.assign(netgraphPanel.style, {
  position: 'fixed',
  top: '12px',
  right: '12px',
  width: '310px',
  padding: '10px 12px',
  background: 'rgba(10, 15, 28, 0.92)',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: '8px',
  fontFamily: 'Consolas, Monaco, monospace',
  fontSize: '12px',
  lineHeight: '1.5',
  zIndex: '1000',
  display: 'none',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
});

const netgraphMetricsEl = document.createElement('div');
const netgraphControlsEl = document.createElement('div');
Object.assign(netgraphControlsEl.style, {
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: '1px solid #334155',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '5px',
});

function makePanelBtn(label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  Object.assign(btn.style, {
    padding: '3px 7px',
    fontSize: '11px',
    cursor: 'pointer',
    background: '#1e293b',
    color: '#f8fafc',
    border: '1px solid #475569',
    borderRadius: '4px',
  });
  return btn;
}

const formatBtn = makePanelBtn('Протокол: BINARY');
const presetIdealBtn = makePanelBtn('0 ms / 0%');
const presetMedBtn = makePanelBtn('100 ms / 2%');
const presetBadBtn = makePanelBtn('220 ms / 8%');

function updatePresetStyles(): void {
  presetIdealBtn.style.borderColor = activeNetPreset === 'ideal' ? '#38bdf8' : '#475569';
  presetMedBtn.style.borderColor = activeNetPreset === 'med' ? '#38bdf8' : '#475569';
  presetBadBtn.style.borderColor = activeNetPreset === 'bad' ? '#38bdf8' : '#475569';
}

formatBtn.addEventListener('click', () => {
  if (!activeConnection) return;
  protocolFormat = protocolFormat === 'binary' ? 'json' : 'binary';
  formatBtn.textContent = `Протокол: ${protocolFormat.toUpperCase()}`;
  activeConnection.send({ type: 'format', format: protocolFormat });
});

presetIdealBtn.addEventListener('click', () => {
  activeNetPreset = 'ideal';
  activeConnection?.setNetworkSimulation({ delayMs: 0, jitterMs: 0, lossPercent: 0 });
  updatePresetStyles();
});

presetMedBtn.addEventListener('click', () => {
  activeNetPreset = 'med';
  activeConnection?.setNetworkSimulation({ delayMs: 100, jitterMs: 20, lossPercent: 2 });
  updatePresetStyles();
});

presetBadBtn.addEventListener('click', () => {
  activeNetPreset = 'bad';
  activeConnection?.setNetworkSimulation({ delayMs: 220, jitterMs: 50, lossPercent: 8 });
  updatePresetStyles();
});

updatePresetStyles();
netgraphControlsEl.append(formatBtn, presetIdealBtn, presetMedBtn, presetBadBtn);
netgraphPanel.append(netgraphMetricsEl, netgraphControlsEl);
document.body.appendChild(netgraphPanel);

window.addEventListener('keydown', (event) => {
  if (event.code === 'F9') {
    netgraphVisible = !netgraphVisible;
    netgraphPanel.style.display =
      netgraphVisible && canvas.canvas.style.display !== 'none'
        ? 'block'
        : 'none';
  }
});

function handleServerSnapshot(snapshot: SnapshotMessage): void {
  const now = performance.now();
  latestServerTick = Number(snapshot.tick);
  lastSnapshotReceivedAt = now;

  if (snapshot.yourShipId) {
    myShipId = Number(snapshot.yourShipId);
  }

  for (const ent of snapshot.entities) {
    if (ent.kind === 'ship' && ent.name) {
      playerNamesByShipId.set(Number(ent.id), ent.name);
    }
  }

  snapshotBuffer.push({
    receivedAt: now,
    tick: snapshot.tick,
    entities: snapshot.entities,
  });
  while (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER) {
    snapshotBuffer.shift();
  }

  const lastAckedSeq = Number(snapshot.lastProcessedSeq);
  pendingInputs = pendingInputs.filter((cmd) => cmd.seq > lastAckedSeq);

  const serverMyShip = snapshot.entities.find(
    (ent): ent is WireShipSnapshot =>
      ent.kind === 'ship' && Number(ent.id) === myShipId,
  );

  if (!serverMyShip) {
    predictedShip = null;
    prevPredictedPos = null;
    pendingInputs = [];
    visualOffsetX = 0;
    visualOffsetY = 0;
    return;
  }

  const oldPredX = predictedShip ? predictedShip.pos.x : serverMyShip.x;
  const oldPredY = predictedShip ? predictedShip.pos.y : serverMyShip.y;
  const oldThrustTime = predictedShip ? predictedShip.thrustTime : 0;

  const reconciled = Ship.fromSnapshot({
    ...serverMyShip,
    playerId: serverMyShip.playerId ?? null,
    name: serverMyShip.name || myPlayerName,
    invulnerable: serverMyShip.invulnerable ? 1 : 0,
  });
  reconciled.thrustTime = oldThrustTime;

  for (const cmd of pendingInputs) {
    reconciled.applyInput(cmd, FIXED_DT);
    reconciled.pos = new Vector2(
      wrapCoord(reconciled.pos.x, WORLD_WIDTH),
      wrapCoord(reconciled.pos.y, WORLD_HEIGHT),
    );
  }

  const errX = shortestWrappedDelta(reconciled.pos.x, oldPredX, WORLD_WIDTH);
  const errY = shortestWrappedDelta(reconciled.pos.y, oldPredY, WORLD_HEIGHT);
  const dist = Math.hypot(errX, errY);

  lastCorrectionPx = dist;
  avgCorrectionPx = avgCorrectionPx * 0.85 + dist * 0.15;

  if (dist > 90) {
    visualOffsetX = 0;
    visualOffsetY = 0;
  } else {
    visualOffsetX += errX;
    visualOffsetY += errY;
  }

  predictedShip = reconciled;
  if (!prevPredictedPos) {
    prevPredictedPos = {
      x: reconciled.pos.x,
      y: reconciled.pos.y,
      angle: reconciled.angle,
    };
  }
}

function stepLocalSimulation(): void {
  if (!activeConnection) return;

  const turnLeft = input.isDown('KeyA') || input.isDown('ArrowLeft');
  const turnRight = input.isDown('KeyD') || input.isDown('ArrowRight');
  const thrustDown = input.isDown('KeyW') || input.isDown('ArrowUp');
  const firePressed = input.isDown('Space');

  const turn: TurnDirection = turnRight && !turnLeft ? 1 : turnLeft && !turnRight ? -1 : 0;
  const thrust: BinaryFlag = thrustDown ? 1 : 0;
  const fire: BinaryFlag = firePressed ? 1 : 0;

  inputSeq += 1;
  const cmd: PendingCommand = {
    seq: inputSeq,
    turn,
    thrust,
    fire,
  };

  pendingInputs.push(cmd);
  if (pendingInputs.length > 60) {
    pendingInputs.shift();
  }

  const payload = encodeMessage(
    {
      type: 'input',
      seq: cmd.seq,
      tick: latestServerTick,
      turn: cmd.turn,
      thrust: cmd.thrust,
      fire: cmd.fire,
    },
    protocolFormat,
  );
  activeConnection.send(payload);

  if (predictedShip && predictedShip.alive) {
    prevPredictedPos = {
      x: predictedShip.pos.x,
      y: predictedShip.pos.y,
      angle: predictedShip.angle,
    };

    const firedBullet = predictedShip.applyInput(cmd, FIXED_DT);
    if (firedBullet) {
      emitGameEvent('fired', {
        bullet: firedBullet,
        ship: predictedShip,
        homing: false,
      });
    }

    predictedShip.pos = new Vector2(
      wrapCoord(predictedShip.pos.x, WORLD_WIDTH),
      wrapCoord(predictedShip.pos.y, WORLD_HEIGHT),
    );
  }
}

function getInterpolatedRemoteEntities(now: number): RenderableEntity[] {
  if (snapshotBuffer.length === 0) return [];

  const renderTime = now - INTERP_DELAY_MS;
  let snapA: SnapshotEntry | null = null;
  let snapB: SnapshotEntry | null = null;

  for (let i = 0; i < snapshotBuffer.length - 1; i++) {
    const a = snapshotBuffer[i];
    const b = snapshotBuffer[i + 1];
    if (a && b && a.receivedAt <= renderTime && b.receivedAt >= renderTime) {
      snapA = a;
      snapB = b;
      break;
    }
  }

  if (!snapA || !snapB) {
    const latest = snapshotBuffer.at(-1);
    if (!latest) return [];
    const extrapSec = Math.min(
      0.1,
      Math.max(0, (renderTime - latest.receivedAt) / 1000),
    );

    return latest.entities
      .filter((ent) => Number(ent.id) !== myShipId)
      .map((ent) => ({
        ...ent,
        x: wrapCoord(ent.x + (ent.vx ?? 0) * extrapSec, WORLD_WIDTH),
        y: wrapCoord(ent.y + (ent.vy ?? 0) * extrapSec, WORLD_HEIGHT),
      }));
  }

  const span = Math.max(1, snapB.receivedAt - snapA.receivedAt);
  const alpha = Math.max(0, Math.min(1, (renderTime - snapA.receivedAt) / span));
  const mapA = new Map(snapA.entities.map((ent) => [ent.id, ent]));

  const result: RenderableEntity[] = [];
  for (const entB of snapB.entities) {
    if (Number(entB.id) === myShipId) continue;

    const entA = mapA.get(entB.id);
    if (!entA) {
      result.push(entB);
      continue;
    }

    const dx = entB.x - entA.x;
    const dy = entB.y - entA.y;
    if (Math.hypot(dx, dy) > 180) {
      result.push(entB);
      continue;
    }

    result.push({
      ...entB,
      x: lerp(entA.x, entB.x, alpha),
      y: lerp(entA.y, entB.y, alpha),
      angle: lerpAngle(entA.angle, entB.angle, alpha),
    });
  }

  return result;
}

let gameAssets: LoadedAssets | null = null;
const gameAudio = new GameAudio();
let isLoadingGame = false;
let retryButton: HTMLButtonElement | null = null;
let loadingError: HTMLParagraphElement | null = null;
let loopRunning = false;
let lastFrameTime = performance.now();
let simAccumulator = 0;

function renderScene(now: number, frameDt: number): void {
  const decay = Math.pow(0.0005, frameDt);
  visualOffsetX *= decay;
  visualOffsetY *= decay;
  if (Math.abs(visualOffsetX) < 0.05) visualOffsetX = 0;
  if (Math.abs(visualOffsetY) < 0.05) visualOffsetY = 0;

  for (let i = localParticles.length - 1; i >= 0; i--) {
    const particle = localParticles[i];
    if (!particle) continue;
    particle.update(frameDt);
    if (!particle.alive) {
      localParticles.splice(i, 1);
    }
  }

  drawBackground(canvas.context, canvas.width, canvas.height);

  const entitiesToDraw = getInterpolatedRemoteEntities(now);

  if (predictedShip && predictedShip.alive) {
    const subAlpha = Math.max(0, Math.min(1, simAccumulator / FIXED_DT));
    let drawX = predictedShip.pos.x;
    let drawY = predictedShip.pos.y;
    let drawAngle = predictedShip.angle;

    if (prevPredictedPos) {
      const stepDx = shortestWrappedDelta(
        prevPredictedPos.x,
        predictedShip.pos.x,
        WORLD_WIDTH,
      );
      const stepDy = shortestWrappedDelta(
        prevPredictedPos.y,
        predictedShip.pos.y,
        WORLD_HEIGHT,
      );
      if (Math.hypot(stepDx, stepDy) < 120) {
        drawX = wrapCoord(prevPredictedPos.x + stepDx * subAlpha, WORLD_WIDTH);
        drawY = wrapCoord(prevPredictedPos.y + stepDy * subAlpha, WORLD_HEIGHT);
      }
      drawAngle = lerpAngle(
        prevPredictedPos.angle,
        predictedShip.angle,
        subAlpha,
      );
    }

    entitiesToDraw.push({
      id: predictedShip.id,
      kind: 'ship',
      name: myPlayerName,
      x: wrapCoord(drawX + visualOffsetX, WORLD_WIDTH),
      y: wrapCoord(drawY + visualOffsetY, WORLD_HEIGHT),
      vx: predictedShip.vel.x,
      vy: predictedShip.vel.y,
      angle: drawAngle,
      radius: predictedShip.radius,
      hp: predictedShip.hp,
      score: predictedShip.score,
      thrust: predictedShip.thrust,
      thrustTime: predictedShip.thrustTime,
      invulnerable: predictedShip.invulnerable,
      isLocal: true,
    });
  }

  for (const entity of entitiesToDraw) {
    const { x, y } = entity;

    if (entity.kind === 'ship') {
      drawShip(canvas.context, {
        x,
        y,
        angle: entity.angle ?? 0,
        thrust: entity.thrust ?? 0,
        thrustTime: entity.thrustTime ?? 0,
      });

      if (entity.invulnerable) {
        canvas.context.save();
        canvas.context.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        canvas.context.lineWidth = 2;
        canvas.context.beginPath();
        canvas.context.arc(x, y, (entity.radius ?? 15) + 7, 0, Math.PI * 2);
        canvas.context.stroke();
        canvas.context.restore();
      }

      const label =
        entity.name ||
        playerNamesByShipId.get(Number(entity.id)) ||
        `Pilot #${entity.id}`;
      canvas.context.save();
      canvas.context.font = '12px sans-serif';
      canvas.context.textAlign = 'center';
      canvas.context.fillStyle = entity.isLocal ? '#7dd3fc' : '#fde047';
      canvas.context.fillText(`${label} [${entity.hp ?? 3} HP]`, x, y - 24);
      canvas.context.restore();
    } else if (entity.kind === 'bullet') {
      const bulletSprite = gameAssets?.sprites?.bullets;
      const bulletFrame = Number(entity.ownerId ?? 0) % 2 === 0 ? 0 : 1;

      if (bulletSprite) {
        drawSpriteFrame(
          canvas.context,
          bulletSprite,
          bulletFrame * 16,
          0,
          16,
          16,
          x,
          y,
          (entity.radius ?? 3) * 3,
          (entity.radius ?? 3) * 3,
          entity.angle ?? 0,
        );
      } else {
        canvas.context.fillStyle = '#ffe66d';
        canvas.context.beginPath();
        canvas.context.arc(x, y, entity.radius ?? 3, 0, Math.PI * 2);
        canvas.context.fill();
      }
    } else if (entity.kind === 'asteroid') {
      const asteroidSprite = gameAssets?.sprites?.asteroids;
      const asteroidFrame = Number(entity.id) % 2 === 0 ? 0 : 1;

      if (asteroidSprite) {
        drawSpriteFrame(
          canvas.context,
          asteroidSprite,
          asteroidFrame * 40,
          0,
          40,
          40,
          x,
          y,
          (entity.radius ?? 20) * 2.5,
          (entity.radius ?? 20) * 2.5,
          entity.angle ?? 0,
        );
      } else {
        canvas.context.strokeStyle = '#a8b3c7';
        canvas.context.lineWidth = 2;
        canvas.context.beginPath();
        canvas.context.arc(x, y, entity.radius ?? 20, 0, Math.PI * 2);
        canvas.context.stroke();
      }
    }
  }

  for (const particle of localParticles) {
    canvas.context.globalAlpha = particle.alpha;
    canvas.context.fillStyle = particle.color;
    canvas.context.beginPath();
    canvas.context.arc(
      particle.pos.x,
      particle.pos.y,
      particle.radius,
      0,
      Math.PI * 2,
    );
    canvas.context.fill();
    canvas.context.globalAlpha = 1;
  }

  const myScore = predictedShip?.score ?? 0;
  const myHp = predictedShip?.hp ?? 0;
  const statusText = predictedShip
    ? `HP: ${myHp}/3 | Очки: ${myScore}`
    : 'Корабель знищено! Відродження через 2 с...';
  hud.textContent = `${statusText} | Сервер: ${TICK_RATE} Hz (тік #${latestServerTick})`;

  if (netgraphVisible) {
    const snapshotAgeMs =
      lastSnapshotReceivedAt > 0
        ? Math.max(0, now - lastSnapshotReceivedAt)
        : 0;
    const txBps = activeConnection?.txBytesPerSec ?? 0;
    const rxBps = activeConnection?.rxBytesPerSec ?? 0;

    netgraphMetricsEl.innerHTML =
      `<div><b>NETGRAPH</b> | FPS: ${fps}</div>` +
      `<div>RTT (пінг): <b>${rttMs.toFixed(1)} ms</b></div>` +
      `<div>Вік знімка: <b>${snapshotAgeMs.toFixed(0)} ms</b> (+${INTERP_DELAY_MS} ms буфер)</div>` +
      `<div>Трафік: TX <b>${txBps} B/s</b> | RX <b>${rxBps} B/s</b></div>` +
      `<div>Черга input (unacked): <b>${pendingInputs.length}</b></div>` +
      `<div>Поправка (reconcil.): <b>${lastCorrectionPx.toFixed(2)} px</b> (avg ${avgCorrectionPx.toFixed(2)})</div>`;
  }
}

function frameLoop(now: number): void {
  if (!loopRunning) return;

  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  const frameDt = Math.min(0.1, Math.max(0, rawDt));

  framesCount += 1;
  if (now - lastFpsTime >= 1000) {
    fps = framesCount;
    framesCount = 0;
    lastFpsTime = now;
  }

  simAccumulator += frameDt;
  while (simAccumulator >= FIXED_DT) {
    stepLocalSimulation();
    simAccumulator -= FIXED_DT;
  }

  renderScene(now, frameDt);
  requestAnimationFrame(frameLoop);
}

async function unlockGameAudio(): Promise<void> {
  try {
    await gameAudio.unlock();

    if (gameAudio.unlocked) {
      document.removeEventListener('pointerdown', unlockGameAudio);
      document.removeEventListener('keydown', unlockGameAudio);
    }
  } catch (error) {
    console.warn('Не вдалося активувати аудіо:', error);
  }
}

document.addEventListener('pointerdown', unlockGameAudio);
document.addEventListener('keydown', unlockGameAudio);

async function startGame(): Promise<void> {
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

    if (!loopRunning) {
      loopRunning = true;
      lastFrameTime = performance.now();
      requestAnimationFrame(frameLoop);
    }
  } catch (error: unknown) {
    console.error('Помилка завантаження гри:', error);

    const errMsg = error instanceof Error ? error.message : String(error);
    loadingError = document.createElement('p');
    loadingError.textContent = `Не вдалося завантажити ресурси: ${errMsg}`;

    retryButton = document.createElement('button');
    retryButton.textContent = 'Спробувати ще раз';
    retryButton.addEventListener('click', () => {
      void startGame();
    });

    app.append(loadingError, retryButton);
  } finally {
    isLoadingGame = false;
  }
}

async function initializeLobby(): Promise<void> {
  const lobby = new Lobby();
  let lobbyView: LobbyViewController | null = null;
  let pollId: ReturnType<typeof setInterval> | null = null;
  let joining = false;

  async function refreshLobby(): Promise<void> {
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
    } catch (error: unknown) {
      if (!lobbyContainer.isConnected || joining) return;

      if (!lobbyView) {
        lobbyView = renderLobby(
          lobbyContainer,
          [],
          joinLobby,
          refreshLobby,
        );
      }

      const errMsg = error instanceof Error ? error.message : String(error);
      lobbyView.setStatus(`Помилка завантаження кімнат: ${errMsg}`);
    }
  }

  async function joinLobby({ name, roomId }: JoinSubmission): Promise<void> {
    if (joining) return;
    joining = true;

    try {
      const room = lobby.join(roomId);

      lobby.cancel();
      if (pollId !== null) {
        clearInterval(pollId);
        pollId = null;
      }

      lobbyContainer.remove();
      title.style.display = '';
      hud.style.display = '';
      controls.style.display = '';
      canvas.canvas.style.display = 'block';
      if (netgraphVisible) {
        netgraphPanel.style.display = 'block';
      }

      myPlayerName = name;
      title.textContent = `SpaceFight — ${name} — ${room.name}`;

      const connection = new Connection();
      activeConnection = connection;

      const chatView = createChatView(document.body, (text) => {
        const sent = connection.send({
          type: 'chat',
          text,
        });

        if (!sent) {
          chatView.setStatus('Повідомлення не надіслано: з’єднання зайняте');
        }
      });

      const pingTimer = setInterval(() => {
        const pingFrame = encodeMessage(
          { type: 'ping', clientTime: performance.now() },
          protocolFormat,
        );
        connection.send(pingFrame);
      }, 1000);

      connection.addEventListener('open', () => {
        chatView.setStatus('Підключено. Вхід до арени...');

        connection.send({
          type: 'join',
          roomId,
          name,
          format: protocolFormat,
        });
      });

      connection.addEventListener('message', (event: Event) => {
        if (!(event instanceof CustomEvent)) return;
        let message: ServerMessage;

        try {
          const detail: unknown = event.detail;
        if (typeof detail !== 'string' && !(detail instanceof ArrayBuffer)) return;
        // Керуючі повідомлення сервера узгоджені зі схемою протоколу
        performance.mark('sf:decode:start');
        // Керуючі повідомлення сервера узгоджені зі схемою протоколу
        message = toServerMessage(decodeMessage(detail));
        performance.mark('sf:decode:end');
        performance.measure('sf:decode', 'sf:decode:start', 'sf:decode:end');
        } catch {
          console.error('Сервер надіслав некоректне повідомлення');
          return;
        }

        if (message.type === 'snapshot') {
          handleServerSnapshot(message);
        } else if (message.type === 'pong') {
          if (message.clientTime > 0) {
            const sampleRtt = Math.max(0, performance.now() - message.clientTime);
            rttMs = rttMs === 0 ? sampleRtt : rttMs * 0.7 + sampleRtt * 0.3;
          }
        } else if (message.type === 'events') {
          for (const ev of message.events ?? []) {
            if (ev.type === 'exploded') {
              spawnExplosionAt(
                ev.x,
                ev.y,
                ev.kind === 'ship' ? 40 : 18,
                ev.kind === 'ship' ? 210 : 130,
                ev.kind === 'ship' ? '#ff6a00' : '#ffb703',
              );
              emitGameEvent('exploded', { entity: ev });
            } else if (ev.type === 'hit') {
              spawnExplosionAt(ev.x, ev.y, 8, 90, '#ffe66d');
              emitGameEvent('hit', { bullet: ev, target: ev });
            }
          }
        } else if (message.type === 'joined') {
          myShipId = Number(message.shipId ?? 0);
          chatView.setStatus(`У кімнаті: ${message.room.playersCount} гравців`);
        } else if (message.type === 'chat') {
          chatView.addMessage({
            name: message.name,
            text: message.text,
            time: message.time,
          });
        }
      });

      connection.addEventListener('close', () => {
        chatView.setStatus('З’єднання втрачено. Спроба відновлення...');
      });

      connection.addEventListener('reconnecting', (event: Event) => {
        if (!(event instanceof CustomEvent)) return;
        const detail: unknown = event.detail;
        if (typeof detail !== 'object' || detail === null) return;
        const attempt = 'attempt' in detail && typeof detail.attempt === 'number' ? detail.attempt : 1;
        chatView.setStatus(
          `Повторне підключення: спроба ${attempt}`,
        );
      });

      connection.addEventListener('error', () => {
        chatView.setStatus('Помилка WebSocket-з’єднання');
      });

      connection.connect();

      window.addEventListener(
        'beforeunload',
        () => {
          clearInterval(pingTimer);
          connection.close();
        },
        { once: true },
      );

      await startGame();
    } catch (error: unknown) {
      joining = false;
      const errMsg = error instanceof Error ? error.message : String(error);
      lobbyView?.setStatus(`Не вдалося увійти: ${errMsg}`);
    }
  }

  await refreshLobby();

  if (lobbyContainer.isConnected) {
    pollId = setInterval(() => {
      void refreshLobby();
    }, 10000);
  }
}

void initializeLobby();





if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ігноруємо помилку реєстрації SW у середовищах без HTTPS
    });
  });
}
