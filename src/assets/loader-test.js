import { fetchJson, loadAll } from './loader.js';

async function testLoader() {
  console.log('Тест 1: завантаження JSON');

  const manifest = await fetchJson('/assets/manifest.json');

  console.log('Маніфест завантажено:', manifest.version);

  console.log('Тест 2: паралельне завантаження ресурсів');

  const controller = new AbortController();

  const loaded = await loadAll(manifest, {
    signal: controller.signal,
    onProgress(progress) {
      console.log(
        `Прогрес: ${progress.loaded}/${progress.total} (${progress.percent}%)`,
      );
    },
  });

  console.log('Ресурси завантажено:', loaded);
}

testLoader().catch((error) => {
  console.error('Тест не пройдено:', error);
});