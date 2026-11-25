export interface LoopOptions {
  step?: number;
  simulate: (dt: number) => void;
  render: (alpha: number, steps: number, frameTime: number) => void;
}

export interface LoopController {
  start(): void;
  stop(): void;
}

export function createLoop({
  step = 1 / 60,
  simulate,
  render,
}: LoopOptions): LoopController {
  let animationId: number | null = null;
  let lastTime = 0;
  let accumulator = 0;

  function frame(currentTime: number): void {
    const frameStart = performance.now();
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.25);

    lastTime = currentTime;
    accumulator += deltaTime;

    let steps = 0;

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      steps++;
    }

    const alpha = accumulator / step;
    const frameTime = performance.now() - frameStart;

    render(alpha, steps, frameTime);

    animationId = requestAnimationFrame(frame);
  }

  function start(): void {
    lastTime = performance.now();
    accumulator = 0;
    animationId = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  return { start, stop };
}
