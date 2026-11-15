export const PROTOCOL_VERSION = 1;

export const MSG_TYPE = {
  INPUT: 1,
  SNAPSHOT: 2,
  PING: 3,
  PONG: 4,
};

export const ENTITY_KIND = {
  ship: 1,
  bullet: 2,
  asteroid: 3,
};

export const ENTITY_KIND_BY_CODE = {
  1: 'ship',
  2: 'bullet',
  3: 'asteroid',
};

export function clampInput(raw) {
  const turn = Math.max(-1, Math.min(1, Math.round(Number(raw?.turn) || 0)));
  const thrust = raw?.thrust ? 1 : 0;
  const fire = raw?.fire ? 1 : 0;
  const seq = (Number(raw?.seq) || 0) >>> 0;
  const tick = (Number(raw?.tick) || 0) >>> 0;

  return { seq, tick, turn, thrust, fire };
}