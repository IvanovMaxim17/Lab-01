import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_DIR: z.string().optional(),
  APP_VERSION: z.string().min(1).default('v1.0.0-dev'),
  ALLOWED_ORIGINS: z.string().default('*'),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(1000).default(20),
  MAX_ROOMS: z.coerce.number().int().min(1).max(500).default(20),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(1).max(128).default(16),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

const env = parsed.data;
const allowedOriginsList =
  env.ALLOWED_ORIGINS.trim() === '*'
    ? ['*']
    : env.ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean);

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly logDir: string;
  readonly appVersion: string;
  readonly allowedOrigins: readonly string[];
  readonly maxConnectionsPerIp: number;
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
}

export const config: ServerConfig = Object.freeze({
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  logDir: env.LOG_DIR ? path.resolve(env.LOG_DIR) : path.resolve(__dirname, '../logs'),
  appVersion: env.APP_VERSION,
  allowedOrigins: allowedOriginsList,
  maxConnectionsPerIp: env.MAX_CONNECTIONS_PER_IP,
  maxRooms: env.MAX_ROOMS,
  maxPlayersPerRoom: env.MAX_PLAYERS_PER_ROOM,
});
