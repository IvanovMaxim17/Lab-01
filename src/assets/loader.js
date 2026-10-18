
function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ??
      new DOMException('Завантаження скасовано', 'AbortError');
  }
}

function isAbortError(error, signal) {
  return (
    signal?.aborted ||
    error?.name === 'AbortError'
  );
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    try {
      throwIfAborted(signal);
    } catch (error) {
      reject(error);
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(
        signal.reason ??
          new DOMException('Завантаження скасовано', 'AbortError'),
      );
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const error = new Error('Не вдалося завантажити ' + url + ': HTTP ' + response.status);
    error.status = response.status;
    throw error;
  }

  try {
    return await response.json();
  } catch (cause) {
    if (signal?.aborted || cause?.name === 'AbortError' || cause?.name === 'TimeoutError') {
      throw cause;
    }

    const error = new Error('Некоректний JSON у ' + url, { cause });
    error.status = 0;
    throw error;
  }
}
export async function loadJson(url, options = {}) {
  return fetchJson(url, options);
}

export async function loadImage(url, { signal } = {}) {
  throwIfAborted(signal);

  const response = await fetch(url, { signal });

  if (!response.ok) {
    const error = new Error('Не вдалося завантажити зображення: ' + url + ' (HTTP ' + response.status + ')');
    error.status = response.status;
    throw error;
  }

  throwIfAborted(signal);
  const blob = await response.blob();
  throwIfAborted(signal);

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };

      const onLoad = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('Не вдалося декодувати зображення: ' + url));
      };

      const onAbort = () => {
        cleanup();
        image.src = '';
        reject(signal.reason ?? new DOMException('Завантаження скасовано', 'AbortError'));
      };

      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });

      if (signal?.aborted) {
        onAbort();
        return;
      }

      image.src = objectUrl;
    });

    throwIfAborted(signal);
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
export async function loadAudio(
  url,
  { signal, audioContext } = {},
) {
  if (!audioContext) {
    throw new Error('Для loadAudio потрібно передати audioContext');
  }

  const response = await fetch(url, { signal });

  if (!response.ok) {
    const error = new Error(
      `Не вдалося завантажити аудіо ${url}: HTTP ${response.status}`,
    );

    error.status = response.status;
    throw error;
  }

  throwIfAborted(signal);

  const data = await response.arrayBuffer();

  throwIfAborted(signal);

  const buffer = await audioContext.decodeAudioData(data);

  throwIfAborted(signal);

  return buffer;
}

export async function withRetry(
  fn,
  {
    attempts = 3,
    baseMs = 300,
    signal,
  } = {},
) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    throwIfAborted(signal);

    try {
      return await fn({ signal });
    } catch (error) {
      lastError = error;

      if (isAbortError(error, signal)) {
        throw error;
      }

      // HTTP 4xx — помилка запиту, повторювати її не потрібно.
      if (
        Number.isInteger(error?.status) &&
        error.status >= 400 &&
        error.status < 500
      ) {
        throw error;
      }

      if (attempt === attempts - 1) {
        throw error;
      }

      const exponentialDelay = baseMs * 2 ** attempt;
      const jitter = Math.random() * baseMs * 0.5;

      await abortableDelay(exponentialDelay + jitter, signal);
    }
  }

  throw lastError;
}

function flattenAssets(node, prefix = '') {
  const result = [];

  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (
      value &&
      typeof value === 'object' &&
      typeof value.url === 'string' &&
      typeof value.type === 'string'
    ) {
      result.push({ path, ...value });
    } else if (value && typeof value === 'object') {
      result.push(...flattenAssets(value, path));
    }
  }

  return result;
}

function setNestedValue(target, path, value) {
  const parts = path.split('.');
  let current = target;

  for (const part of parts.slice(0, -1)) {
    current[part] ??= {};
    current = current[part];
  }

  current[parts.at(-1)] = value;
}

export async function loadAll(
  manifest,
  {
    signal,
    audioContext,
    onProgress = () => {},
    attempts = 3,
    baseMs = 300,
  } = {},
) {
  const entries = flattenAssets(manifest.assets ?? manifest);
  const loaded = {};
  let completed = 0;

  onProgress({
    loaded: 0,
    total: entries.length,
    percent: entries.length === 0 ? 100 : 0,
    current: null,
  });

  await Promise.all(
    entries.map(async (entry) => {
      throwIfAborted(signal);

      const loader = {
        image: () => loadImage(entry.url, { signal }),
        audio: () => loadAudio(entry.url, { signal, audioContext }),
        json: () => loadJson(entry.url, { signal }),
      }[entry.type];

      if (!loader) {
        throw new Error(
          `Невідомий тип ресурсу "${entry.type}": ${entry.url}`,
        );
      }

      const value = await withRetry(loader, {
        attempts,
        baseMs,
        signal,
      });

      setNestedValue(loaded, entry.path, value);

      completed++;

      onProgress({
        loaded: completed,
        total: entries.length,
        percent: Math.round((completed / entries.length) * 100),
        current: entry.path,
      });
    }),
  );

  return loaded;
}
