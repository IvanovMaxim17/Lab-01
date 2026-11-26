export interface SpatialItem {
  readonly id: number;
  readonly pos: { readonly x: number; readonly y: number };
  readonly radius: number;
}

export class SpatialHash<T extends SpatialItem> {
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
  readonly #cols: number;
  readonly #rows: number;
  readonly #cells: Map<number, T[]> = new Map();

  constructor(width: number, height: number, cellSize = 80) {
    this.width = width;
    this.height = height;
    this.cellSize = Math.max(16, cellSize);
    this.#cols = Math.max(1, Math.ceil(width / this.cellSize));
    this.#rows = Math.max(1, Math.ceil(height / this.cellSize));
  }

  clear(): void {
    for (const bucket of this.#cells.values()) {
      bucket.length = 0;
    }
  }

  #wrapCol(cx: number): number {
    return ((cx % this.#cols) + this.#cols) % this.#cols;
  }

  #wrapRow(cy: number): number {
    return ((cy % this.#rows) + this.#rows) % this.#rows;
  }

  #key(cx: number, cy: number): number {
    return this.#wrapRow(cy) * this.#cols + this.#wrapCol(cx);
  }

  insert(item: T): void {
    const minX = Math.floor((item.pos.x - item.radius) / this.cellSize);
    const maxX = Math.floor((item.pos.x + item.radius) / this.cellSize);
    const minY = Math.floor((item.pos.y - item.radius) / this.cellSize);
    const maxY = Math.floor((item.pos.y + item.radius) / this.cellSize);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const k = this.#key(cx, cy);
        let bucket = this.#cells.get(k);
        if (!bucket) {
          bucket = [];
          this.#cells.set(k, bucket);
        }
        bucket.push(item);
      }
    }
  }

  query(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);

    const seen = new Set<number>();

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.#cells.get(this.#key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          if (item !== undefined && !seen.has(item.id)) {
            seen.add(item.id);
            out.push(item);
          }
        }
      }
    }

    return out;
  }
}
