class AssetLoadError extends Error {
  status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

export interface SignalOptions {
  signal?: AbortSignal | undefined;
}

export interface AudioLoadOptions extends SignalOptions {
  audioContext?: AudioContext | undefined;
}

export interface RetryOptions extends SignalOptions {
  attempts?: number;
  baseMs?: number;
}

export interface LoadProgressInfo {
  readonly loaded: number;
  readonly total: number;
  readonly percent: number;
  readonly current: string | null;
}

export interface LoadAllOptions extends RetryOptions {
  audioContext?: AudioContext | undefined;
  onProgress?: (info: LoadProgressInfo) => void;
}

export interface AssetManifestEntry {
  readonly url: string;
  readonly type: 'image' | 'audio' | 'json' | (string & {});
}

export interface AssetManifest {
  readonly version?: string | number;
  readonly assets?: object;
}

export interface LoadedAssets {
  sprites: Record<string, HTMLImageElement | undefined>;
  audio: Record<string, AudioBuffer | undefined>;
  data: Record<string, unknown>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isManifestEntry(value: unknown): value is AssetManifestEntry {
  return (
    isPlainRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.type === 'string'
  );
}

function extractHttpStatus(error: unknown): number | undefined {
  if (error instanceof AssetLoadError) {
    return error.status;
  }
  if (isPlainRecord(error) && typeof error.status === 'number') {
    return error.status;
  }
  return undefined;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException('Завантаження скасовано', 'AbortError')
    );
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return (
    Boolean(signal?.aborted) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      throwIfAborted(signal);
    } catch (error) {
      reject(error);
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(
        signal?.reason ??
          new DOMException('Завантаження скасовано', 'AbortError'),
      );
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchJson(
  url: string,
  { signal }: SignalOptions = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: signal ?? null });

  if (!response.ok) {
    throw new AssetLoadError(
      `Не вдалося завантажити ${url}: HTTP ${response.status}`,
      response.status,
    );
  }

  try {
    const parsed: unknown = await response.json();
    if (!isPlainRecord(parsed)) {
      throw new AssetLoadError(`Очікувався JSON-об'єкт у ${url}`, 0);
    }
    return parsed;
  } catch (cause) {
    if (
      signal?.aborted ||
      (cause instanceof Error &&
        (cause.name === 'AbortError' || cause.name === 'TimeoutError'))
    ) {
      throw cause;
    }

    throw new AssetLoadError(`Некоректний JSON у ${url}`, 0, { cause });
  }
}

export async function loadJson(
  url: string,
  options: SignalOptions = {},
): Promise<Record<string, unknown>> {
  return fetchJson(url, options);
}

export async function loadImage(
  url: string,
  { signal }: SignalOptions = {},
): Promise<HTMLImageElement> {
  throwIfAborted(signal);

  const response = await fetch(url, { signal: signal ?? null });

  if (!response.ok) {
    throw new AssetLoadError(
      `Не вдалося завантажити зображення: ${url} (HTTP ${response.status})`,
      response.status,
    );
  }

  throwIfAborted(signal);
  const blob = await response.blob();
  throwIfAborted(signal);

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };

      const onLoad = (): void => {
        cleanup();
        resolve();
      };

      const onError = (): void => {
        cleanup();
        reject(new Error(`Не вдалося декодувати зображення: ${url}`));
      };

      const onAbort = (): void => {
        cleanup();
        image.src = '';
        reject(
          signal?.reason ??
            new DOMException('Завантаження скасовано', 'AbortError'),
        );
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
  url: string,
  { signal, audioContext }: AudioLoadOptions = {},
): Promise<AudioBuffer> {
  if (!audioContext) {
    throw new Error('Для loadAudio потрібно передати audioContext');
  }

  const response = await fetch(url, { signal: signal ?? null });

  if (!response.ok) {
    throw new AssetLoadError(
      `Не вдалося завантажити аудіо ${url}: HTTP ${response.status}`,
      response.status,
    );
  }

  throwIfAborted(signal);

  const data = await response.arrayBuffer();

  throwIfAborted(signal);

  const buffer = await audioContext.decodeAudioData(data);

  throwIfAborted(signal);

  return buffer;
}

export async function withRetry<T>(
  fn: (opts: SignalOptions) => Promise<T>,
  { attempts = 3, baseMs = 300, signal }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    throwIfAborted(signal);

    try {
      return await fn({ signal });
    } catch (error) {
      lastError = error;

      if (isAbortError(error, signal)) {
        throw error;
      }

      const status = extractHttpStatus(error);

      if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 500) {
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

interface FlattenedEntry extends AssetManifestEntry {
  readonly path: string;
}

function flattenAssets(node: object, prefix = ''): FlattenedEntry[] {
  const result: FlattenedEntry[] = [];

  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isManifestEntry(value)) {
      result.push({ path, url: value.url, type: value.type });
    } else if (isPlainRecord(value)) {
      result.push(...flattenAssets(value, path));
    }
  }

  return result;
}

function setNestedValue(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.');
  let current = target;

  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (!isPlainRecord(existing)) {
      const next: Record<string, unknown> = {};
      current[part] = next;
      current = next;
    } else {
      current = existing;
    }
  }

  const lastKey = parts.at(-1);
  if (lastKey) {
    current[lastKey] = value;
  }
}

export async function loadAll(
  manifest: AssetManifest,
  {
    signal,
    audioContext,
    onProgress = () => {},
    attempts = 3,
    baseMs = 300,
  }: LoadAllOptions = {},
): Promise<LoadedAssets> {
  const root = isPlainRecord(manifest.assets) ? manifest.assets : manifest;
  const entries = flattenAssets(root);
  const loadedSprites: Record<string, HTMLImageElement | undefined> = {};
  const loadedAudio: Record<string, AudioBuffer | undefined> = {};
  const loadedData: Record<string, unknown> = {};
  const loadedRoot: Record<string, unknown> = {
    sprites: loadedSprites,
    audio: loadedAudio,
    data: loadedData,
  };
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

      const loaders: Record<string, (() => Promise<unknown>) | undefined> = {
        image: () => loadImage(entry.url, { signal }),
        audio: () => loadAudio(entry.url, { signal, audioContext }),
        json: () => loadJson(entry.url, { signal }),
      };

      const loader = loaders[entry.type];

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

      setNestedValue(loadedRoot, entry.path, value);

      completed++;

      onProgress({
        loaded: completed,
        total: entries.length,
        percent: Math.round((completed / entries.length) * 100),
        current: entry.path,
      });
    }),
  );

  return {
    sprites: loadedSprites,
    audio: loadedAudio,
    data: loadedData,
  };
}



