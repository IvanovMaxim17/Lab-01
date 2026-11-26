export interface LobbyRoom {
  readonly id: string;
  readonly name: string;
  readonly asteroidCount: number;
  readonly difficulty: string;
  readonly playersCount?: number;
  readonly seed?: number;
  readonly createdAt?: string;
}

export class Lobby extends EventTarget {
  readonly url: string;
  rooms: LobbyRoom[];
  currentRoom: LobbyRoom | null;
  controller: AbortController | null;

  constructor(url = '/api/rooms') {
    super();
    this.url = url;
    this.rooms = [];
    this.currentRoom = null;
    this.controller = null;
  }

  async refresh(): Promise<LobbyRoom[]> {
    this.controller?.abort();
    this.controller = new AbortController();

    const signal = AbortSignal.any([
      this.controller.signal,
      AbortSignal.timeout(5000),
    ]);

    this.dispatchEvent(new CustomEvent('loading'));

    try {
      const response = await fetch(this.url, { signal });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: не вдалося завантажити кімнати`,
        );
      }

      const data: unknown = await response.json();

      if (
        typeof data !== 'object' ||
        data === null ||
        !('rooms' in data) ||
        !Array.isArray(data.rooms)
      ) {
        throw new Error('Неправильний формат списку кімнат');
      }

      this.rooms = data.rooms.filter(
        (item: unknown): item is LobbyRoom =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          typeof item.id === 'string' &&
          'name' in item &&
          typeof item.name === 'string' &&
          'asteroidCount' in item &&
          typeof item.asteroidCount === 'number' &&
          'difficulty' in item &&
          typeof item.difficulty === 'string',
      );

      this.dispatchEvent(
        new CustomEvent<LobbyRoom[]>('rooms', { detail: this.rooms }),
      );

      return this.rooms;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        return [];
      }

      this.dispatchEvent(
        new CustomEvent('error', { detail: error }),
      );

      throw error;
    }
  }

  join(roomId: string): LobbyRoom {
    const room = this.rooms.find((item) => item.id === roomId);

    if (!room) {
      throw new Error(`Кімнату "${roomId}" не знайдено`);
    }

    this.currentRoom = room;

    this.dispatchEvent(
      new CustomEvent<LobbyRoom>('joined', { detail: room }),
    );

    return room;
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }
}


