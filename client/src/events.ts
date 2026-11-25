export const gameEvents = new EventTarget();

export function emitGameEvent<T = Record<string, unknown>>(
  name: string,
  detail?: T,
): void {
  gameEvents.dispatchEvent(new CustomEvent<T | undefined>(name, { detail }));
}
