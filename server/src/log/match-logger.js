
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function createMatchLogger(logDir) {
  await mkdir(logDir, { recursive: true });

  const fileName = `match-${Date.now()}.ndjson`;
  const filePath = path.join(logDir, fileName);

  const output = createWriteStream(filePath, {
    flags: 'a',
    encoding: 'utf8',
  });

  const formatter = new Transform({
    writableObjectMode: true,

    transform(event, encoding, callback) {
      try {
        callback(null, `${JSON.stringify(event)}\n`);
      } catch (error) {
        callback(error);
      }
    },
  });

  const pipelinePromise = pipeline(formatter, output);

  return {
    filePath,

    write(event) {
      return formatter.write(event);
    },

    async close() {
      formatter.end();
      await pipelinePromise;
    },
  };
}
