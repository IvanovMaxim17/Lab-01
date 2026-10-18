export class Lobby extends EventTarget {
  constructor(url = '/api/rooms.json') {
    super();
    this.url = url;
    this.rooms = [];
    this.currentRoom = null;
    this.controller = null;
  }

  async refresh() {
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
        throw new Error(`HTTP ${response.status}: не вдалося завантажити кімнати`);
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.rooms)) {
        throw new Error('Неправильний формат списку кімнат');
      }

      this.rooms = data.rooms;
      this.dispatchEvent(
        new CustomEvent('rooms', { detail: this.rooms }),
      );

      return this.rooms;
    } catch (error) {
      if (error.name === 'AbortError') {
        return [];
      }

      this.dispatchEvent(
        new CustomEvent('error', { detail: error }),
      );

      throw error;
    }
  }

  join(roomId) {
    const room = this.rooms.find((item) => item.id === roomId);

    if (!room) {
      throw new Error(`Кімнату "${roomId}" не знайдено`);
    }

    this.currentRoom = room;

    this.dispatchEvent(
      new CustomEvent('joined', { detail: room }),
    );

    return room;
  }

  cancel() {
    this.controller?.abort();
    this.controller = null;
  }
}
