import {
  fetchJson,
  loadAll,
  type LoadedAssets,
  type LoadProgressInfo,
  type SignalOptions,
} from './loader.js';
import { drawLoadingScreen } from './loading-screen.js';
import type { CanvasController } from '../render/canvas.js';

export async function loadGameAssets(
  canvas: CanvasController,
  audioContext: AudioContext,
  options: SignalOptions = {},
): Promise<LoadedAssets> {
  const { context } = canvas;
  const { signal } = options;

  let progress: LoadProgressInfo = {
    loaded: 0,
    total: 1,
    percent: 0,
    current: null,
  };

  function renderProgress(status = 'Завантаження ресурсів...'): void {
    drawLoadingScreen(context, canvas.width, canvas.height, {
      ...progress,
      status,
    });
  }

  renderProgress('Завантажуємо маніфест...');

  const manifest = await fetchJson('/assets/manifest.json', {
    signal,
  });

  renderProgress();

  const assets = await loadAll(manifest, {
    signal,
    audioContext,
    onProgress(info) {
      progress = info;
      renderProgress();
    },
  });

  renderProgress('Ресурси завантажено');

  return assets;
}


