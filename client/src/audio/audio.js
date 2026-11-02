import { gameEvents } from '../events.js';

export class GameAudio {
  constructor() {
    this.context = new AudioContext();
    this.buffers = {};
    this.unlocked = false;

    this.onFired = () => this.play('shoot');
    this.onHit = () => this.play('hit');
    this.onExploded = () => this.play('explosion');

    gameEvents.addEventListener('fired', this.onFired);
    gameEvents.addEventListener('hit', this.onHit);
    gameEvents.addEventListener('exploded', this.onExploded);
  }

  setBuffers(buffers) {
    this.buffers = buffers;
  }

  async unlock() {
    if (this.context.state !== 'running') {
      await this.context.resume();
    }

    this.unlocked = this.context.state === 'running';
  }

  play(name) {
    if (!this.unlocked || this.context.state !== 'running') return;

    const buffer = this.buffers[name];
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.start();
  }

  dispose() {
    gameEvents.removeEventListener('fired', this.onFired);
    gameEvents.removeEventListener('hit', this.onHit);
    gameEvents.removeEventListener('exploded', this.onExploded);

    if (this.context.state !== 'closed') {
      return this.context.close();
    }
  }
}
