import pino from 'pino';
import {
  Registry,
  collectDefaultMetrics,
  Gauge,
  Counter,
  Histogram,
} from 'prom-client';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  base: {
    service: 'spacefight-server',
    version: config.appVersion,
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.secret'],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'spacefight_' });

export const activePlayersGauge = new Gauge({
  name: 'spacefight_active_players',
  help: 'Current number of connected players',
  registers: [metricsRegistry],
});

export const activeRoomsGauge = new Gauge({
  name: 'spacefight_active_rooms',
  help: 'Current number of active rooms',
  registers: [metricsRegistry],
});

export const wsMessagesTotal = new Counter({
  name: 'spacefight_ws_messages_total',
  help: 'Total WebSocket messages processed',
  labelNames: ['direction'] as const,
  registers: [metricsRegistry],
});

export const wsBytesTotal = new Counter({
  name: 'spacefight_ws_bytes_total',
  help: 'Total WebSocket bytes transferred',
  labelNames: ['direction'] as const,
  registers: [metricsRegistry],
});

export const rejectionsTotal = new Counter({
  name: 'spacefight_rejections_total',
  help: 'Total rejected connections or messages by reason',
  labelNames: ['reason'] as const,
  registers: [metricsRegistry],
});

export const tickDurationHistogram = new Histogram({
  name: 'spacefight_tick_duration_seconds',
  help: 'Simulation tick duration in seconds',
  buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.02, 0.033, 0.05],
  registers: [metricsRegistry],
});
