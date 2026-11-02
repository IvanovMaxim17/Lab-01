import { fetchJson, loadAll } from './loader.js';
import { drawLoadingScreen } from './loading-screen.js';

export async function loadGameAssets(canvas, audioContext, options = {}) {
  const { context } = canvas;
  const { signal } = options;

  const progress = {
    loaded: 0,
    total: 1,
    percent: 0,
    current: null,
  };

  function renderProgress(status = 'Завантаження ресурсів...') {
    drawLoadingScreen(
      context,
      canvas.width,
      canvas.height,
      { ...progress, status },
    );
  }

  renderProgress('Завантажуємо маніфест...');

  const manifest = await fetchJson('/assets/manifest.json', { signal });

  renderProgress();

  const assets = await loadAll(manifest, {
    signal,
    audioContext,
    onProgress(info) {
      Object.assign(progress, info);
      renderProgress();
    },
  });

  renderProgress('Ресурси завантажено');

  return assets;
}
