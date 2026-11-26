// Web Worker для паралельного оновлення масиву частинок через transferable Float32Array
// Формат буфера: по 5 float32 на частинку [x, y, vx, vy, life]
const STRIDE = 5;

globalThis.addEventListener('message', (event: Event) => {
  if (!('data' in event)) return;
  const payload: unknown = event.data;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('buffer' in payload) ||
    !(payload.buffer instanceof ArrayBuffer)
  ) {
    return;
  }

  const dt =
    'dt' in payload && typeof payload.dt === 'number' && Number.isFinite(payload.dt)
      ? payload.dt
      : 1 / 60;

  const data = new Float32Array(payload.buffer);
  let aliveCount = 0;

  for (let i = 0; i + STRIDE <= data.length; i += STRIDE) {
    const life = (data[i + 4] ?? 0) - dt;
    if (life <= 0) {
      data[i + 4] = 0;
      continue;
    }
    data[i] = (data[i] ?? 0) + (data[i + 2] ?? 0) * dt;
    data[i + 1] = (data[i + 1] ?? 0) + (data[i + 3] ?? 0) * dt;
    data[i + 2] = (data[i + 2] ?? 0) * 0.98;
    data[i + 3] = (data[i + 3] ?? 0) * 0.98;
    data[i + 4] = life;
    aliveCount += 1;
  }

  Reflect.apply(globalThis.postMessage, globalThis, [
    { buffer: data.buffer, aliveCount },
    [data.buffer],
  ]);
});
