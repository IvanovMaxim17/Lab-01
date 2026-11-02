export class Connection extends EventTarget {
  constructor(url = null) {
    super();

    this.url =
      url ??
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

    this.socket = null;
    this.queue = [];
    this.maxQueueSize = 100;
    this.maxBufferedAmount = 64 * 1024;

    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.baseReconnectDelay = 500;
    this.maxReconnectDelay = 10000;

    this.manuallyClosed = false;
  }

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.manuallyClosed = false;

    clearTimeout(this.reconnectTimer);

    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;

      this.dispatchEvent(new Event('open'));

      this.flushQueue();
    });

    this.socket.addEventListener('message', (event) => {
      this.dispatchEvent(
        new CustomEvent('message', {
          detail: event.data,
        }),
      );
    });

    this.socket.addEventListener('error', (event) => {
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: event,
        }),
      );
    });

    this.socket.addEventListener('close', (event) => {
      this.dispatchEvent(
        new CustomEvent('close', {
          detail: {
            code: event.code,
            reason: event.reason,
          },
        }),
      );

      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    });
  }

  send(message) {
    const data = JSON.stringify(message);

    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN
    ) {
      if (this.socket.bufferedAmount >= this.maxBufferedAmount) {
        this.dispatchEvent(new Event('backpressure'));
        return false;
      }

      this.socket.send(data);
      return true;
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.dispatchEvent(new Event('queuefull'));
      return false;
    }

    this.queue.push(data);

    if (
      !this.socket ||
      this.socket.readyState === WebSocket.CLOSED
    ) {
      this.connect();
    }

    return true;
  }

  flushQueue() {
    while (
      this.queue.length > 0 &&
      this.socket?.readyState === WebSocket.OPEN
    ) {
      if (this.socket.bufferedAmount >= this.maxBufferedAmount) {
        this.dispatchEvent(new Event('backpressure'));
        return;
      }

      const message = this.queue.shift();
      this.socket.send(message);
    }
  }

  scheduleReconnect() {
    if (this.manuallyClosed || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay,
    );

    this.reconnectAttempts += 1;

    this.dispatchEvent(
      new CustomEvent('reconnecting', {
        detail: {
          attempt: this.reconnectAttempts,
          delay,
        },
      }),
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  close() {
    this.manuallyClosed = true;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    this.queue = [];

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      this.socket.close(1000, 'Client disconnected');
    }
  }
}