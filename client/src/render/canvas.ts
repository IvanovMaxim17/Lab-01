export interface CanvasController {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
}

export function createCanvas(): CanvasController {
  const canvas = document.createElement('canvas');

  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '70vh';

  document.body.append(canvas);

  const rawContext = canvas.getContext('2d');
  if (!rawContext) {
    throw new Error('2D canvas context is unavailable');
  }
  const context = rawContext;

  let width = 800;
  let height = 600;

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;

    width = window.innerWidth;
    height = window.innerHeight * 0.7;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resize);

  resize();

  return {
    canvas,
    context,
    get width(): number {
      return width;
    },
    get height(): number {
      return height;
    },
  };
}
