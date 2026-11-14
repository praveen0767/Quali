/**
 * Secure CORS Configuration
 *
 * Production-appropriate CORS settings that follow the principle of least privilege.
 * In development, allows broader access; in production, restricts to configured origins.
 */

import cors, { CorsOptions, CorsRequest } from 'cors';
import { Request, Response, NextFunction } from 'express';
import { SecureCORSOptions } from '../../lib/api/types';
import { structuredLog } from './correlation';

/**
 * Default production-safe CORS configuration
 */
export const defaultSecureCORS: SecureCORSOptions = {
  allowedOrigins: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [])
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  allowedMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Correlation-Id',
    'X-Request-Id',
  ],
  exposedHeaders: ['X-Correlation-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204,
};

/**
 * Create CORS middleware with secure defaults
 */
export function createSecureCORS(options: Partial<SecureCORSOptions> = {}): CorsOptions {
  const config: SecureCORSOptions = { ...defaultSecureCORS, ...options };

  return {
    origin: (origin, callback) => {
      // Allow requests with no Origin header (server-to-server calls, health
      // probes, curl, the reverse proxy itself). CORS is a browser-enforced
      // control: rejecting absent-Origin requests adds no security because any
      // non-browser client can set or omit Origin freely, while it would break
      // proxied health checks and readiness probes in production.
      if (!origin) {
        callback(null, true);
        return;
      }

      // Check against allowed origins (supports wildcard patterns)
      const allowed = config.allowedOrigins.some((allowedOrigin: string) => {
        if (allowedOrigin.startsWith('*.')) {
          // Wildcard subdomain match
          const domain = allowedOrigin.slice(2);
          return origin.endsWith(domain) || origin === `https://${domain}` || origin === `http://${domain}`;
        }
        return origin === allowedOrigin;
      });

      if (allowed) {
        callback(null, true);
      } else {
        structuredLog({
          timestamp: new Date().toISOString(),
          correlationId: 'unknown',
          level: 'warn',
          message: 'CORS origin rejected',
          metadata: { origin: origin as string, allowedOrigins: config.allowedOrigins },
        });
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    },
    methods: config.allowedMethods,
    allowedHeaders: config.allowedHeaders,
    exposedHeaders: config.exposedHeaders,
    credentials: config.credentials,
    maxAge: config.maxAge,
    optionsSuccessStatus: config.optionsSuccessStatus,
  };
}

/**
 * Stricter CORS for API endpoints handling sensitive data
 */
export function createStrictAPICORS(): CorsOptions {
  const config: SecureCORSOptions = {
    ...defaultSecureCORS,
    allowedMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    exposedHeaders: ['X-Correlation-Id'],
  };

  return {
    origin: (origin, callback) => {
      // Always require origin for API routes
      if (!origin) {
        callback(new Error('Origin required for API access'), false);
        return;
      }

      const allowed = config.allowedOrigins.some((allowedOrigin: string) => {
        if (allowedOrigin.startsWith('*.')) {
          const domain = allowedOrigin.slice(2);
          return origin.endsWith(domain);
        }
        return origin === allowedOrigin;
      });

      callback(allowed ? null : new Error(`Origin not allowed`), allowed ? origin : undefined);
    },
    methods: config.allowedMethods,
    allowedHeaders: config.allowedHeaders,
    exposedHeaders: config.exposedHeaders,
    credentials: config.credentials,
    optionsSuccessStatus: config.optionsSuccessStatus,
  };
}

/**
 * Preflight cache configuration
 */
export function setPreflightCacheHeaders(res: Response, maxAge: number = 86400): void {
  res.setHeader('Access-Control-Max-Age', maxAge.toString());
}
