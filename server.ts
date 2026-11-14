import dotenv from 'dotenv';
// quiet: keep stdout exclusively JSON so container logs stay machine-parseable.
dotenv.config({ quiet: true });

import { createApp } from './src/server/app';

const PORT = parseInt(process.env.PORT || '8000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Bounded request handling. nginx applies its own proxy timeouts; these are the
// last line of defence so a slow or abandoned request cannot pin a worker.
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);
const HEADERS_TIMEOUT_MS = parseInt(process.env.HEADERS_TIMEOUT_MS || '20000', 10);
const KEEP_ALIVE_TIMEOUT_MS = parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS || '65000', 10);
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10);

function log(level: 'info' | 'warn' | 'error', message: string, metadata: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'quali-api',
    metadata,
  }));
}

// Fail fast on missing production configuration instead of silently rejecting
// every browser request at runtime.
if (process.env.NODE_ENV === 'production') {
  const origins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    log('error', 'ALLOWED_ORIGINS must be set in production (comma-separated frontend origins, e.g. https://quali.example.com).');
    process.exit(1);
  }
}

const app = await createApp();

const server = app.listen(PORT, HOST, () => {
  log('info', 'Quali API listening', {
    host: HOST,
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    headersTimeoutMs: HEADERS_TIMEOUT_MS,
  });
});

server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = HEADERS_TIMEOUT_MS;
server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  log('info', 'Shutting down', { signal });

  // Stop accepting connections, then force-exit if in-flight work stalls.
  const forceExit = setTimeout(() => {
    log('error', 'Forced shutdown after timeout', { signal, timeoutMs: SHUTDOWN_TIMEOUT_MS });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(() => {
    log('info', 'Shutdown complete', { signal });
    process.exit(0);
  });

  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException');
});
