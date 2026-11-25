import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface MatchLogEvent {
  readonly type: string;
  readonly timestamp?: string;
  readonly [key: string]: unknown;
}

export interface MatchLogger {
  readonly filePath: string;
  write(event: MatchLogEvent): boolean;
  close(): Promise<void>;
}

export async function createMatchLogger(logDir: string): Promise<MatchLogger> {
  await mkdir(logDir, { recursive: true });

  const fileName = `match-${Date.now()}.ndjson`;
  const filePath = path.join(logDir, fileName);

  const output = createWriteStream(filePath, {
    flags: 'a',
    encoding: 'utf8',
  });

  const formatter = new Transform({
    writableObjectMode: true,

    transform(event: unknown, _encoding: BufferEncoding, callback: TransformCallback) {
      try {
        callback(null, `${JSON.stringify(event)}\n`);
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });

  const pipelinePromise = pipeline(formatter, output);

  return {
    filePath,

    write(event: MatchLogEvent): boolean {
      return formatter.write(event);
    },

    async close(): Promise<void> {
      formatter.end();
      await pipelinePromise;
    },
  };
}
