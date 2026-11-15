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

    // Параметри штучної мережевої затримки, розкиду та втрати пакетів
    this.simDelayMs = 0;
    this.simJitterMs = 0;
    this.simLossPercent = 0;

    // Лічильники трафіку для netgraph (байти/с)
    this._txBytesAccum = 0;
    this._rxBytesAccum = 0;
    this.txBytesPerSec = 0;
    this.rxBytesPerSec = 0;
    this._statsTimer = setInterval(() => {
      this.txBytesPerSec = this._txBytesAccum;
      this.rxBytesPerSec = this._rxBytesAccum;
      this._txBytesAccum = 0;
      this._rxBytesAccum = 0;
    }, 1000);
  }

  setNetworkSimulation({ delayMs = 0, jitterMs = 0, lossPercent = 0 } = {}) {
    this.simDelayMs = Math.max(0, Number(delayMs) || 0);
    this.simJitterMs = Math.max(0, Number(jitterMs) || 0);
    this.simLossPercent = Math.max(0, Math.min(90, Number(lossPercent) || 0));
  }

  #computeSimulatedDelay() {
    if (this.simDelayMs <= 0 && this.simJitterMs <= 0) return 0;
    const jitter = (Math.random() * 2 - 1) * this.simJitterMs;
    return Math.max(0, this.simDelayMs + jitter);
  }

  #shouldDropPacket() {
    if (this.simLossPercent <= 0) return false;
    return Math.random() * 100 < this.simLossPercent;
  }

  #measureByteLength(payload) {
    if (typeof payload === 'string') {
      return new TextEncoder().encode(payload).byteLength;
    }
    if (payload instanceof ArrayBuffer) {
      return payload.byteLength;
    }
    if (ArrayBuffer.isView(payload)) {
      return payload.byteLength;
    }
    return 0;
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
    this.socket.binaryType = 'arraybuffer';

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;

      this.dispatchEvent(new Event('open'));
      this.flushQueue();
    });

    this.socket.addEventListener('message', (event) => {
      const raw = event.data;
      this._rxBytesAccum += this.#measureByteLength(raw);

      // Штучні втрата і затримка для вхідних пакетів (крім службового join)
      const isControlJson =
        typeof raw === 'string' &&
        (raw.includes('"type":"joined"') || raw.includes('"type":"chat"'));

      if (!isControlJson && this.#shouldDropPacket()) {
        return;
      }

      const delay = isControlJson ? 0 : this.#computeSimulatedDelay();
      if (delay > 0) {
        setTimeout(() => {
          this.dispatchEvent(
            new CustomEvent('message', {
              detail: raw,
            }),
          );
        }, delay);
      } else {
        this.dispatchEvent(
          new CustomEvent('message', {
            detail: raw,
          }),
        );
      }
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
    const isRawBinary =
      message instanceof ArrayBuffer || ArrayBuffer.isView(message);
    const data =
      isRawBinary || typeof message === 'string'
        ? message
        : JSON.stringify(message);

    const isControlJson =
      typeof data === 'string' &&
      (data.includes('"type":"join"') || data.includes('"type":"chat"'));

    if (!isControlJson && this.#shouldDropPacket()) {
      return true;
    }

    const delay = isControlJson ? 0 : this.#computeSimulatedDelay();
    if (delay > 0) {
      setTimeout(() => {
        this.#transmitNow(data);
      }, delay);
      return true;
    }

    return this.#transmitNow(data);
  }

  #transmitNow(data) {
    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN
    ) {
      if (this.socket.bufferedAmount >= this.maxBufferedAmount) {
        this.dispatchEvent(new Event('backpressure'));
        return false;
      }

      this._txBytesAccum += this.#measureByteLength(data);
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
      this._txBytesAccum += this.#measureByteLength(message);
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
    clearInterval(this._statsTimer);

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