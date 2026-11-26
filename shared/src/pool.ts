export class ObjectPool<T> {
  readonly #factory: () => T;
  readonly #reset: (item: T) => void;
  readonly #free: T[] = [];
  #created = 0;
  #acquired = 0;
  #released = 0;

  constructor(factory: () => T, reset: (item: T) => void, initialSize = 0) {
    this.#factory = factory;
    this.#reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.#free.push(this.#factory());
      this.#created += 1;
    }
  }

  acquire(): T {
    this.#acquired += 1;
    const item = this.#free.pop();
    if (item !== undefined) {
      return item;
    }
    this.#created += 1;
    return this.#factory();
  }

  release(item: T): void {
    this.#released += 1;
    this.#reset(item);
    this.#free.push(item);
  }

  get available(): number {
    return this.#free.length;
  }

  get stats(): { created: number; acquired: number; released: number; available: number } {
    return {
      created: this.#created,
      acquired: this.#acquired,
      released: this.#released,
      available: this.#free.length,
    };
  }
}
