/**
 * Rate Limiting Middleware
 *
 * Protects against abuse by limiting request rates per client.
 * Uses in-memory store (for production, use Redis or similar).
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimitConfig, RateLimitEntry, RateLimitResult } from '../../lib/api/types';
import { structuredLog } from './correlation';

interface RateLimitStore {
  [key: string]: RateLimitEntry;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 100,
  keyGenerator: (req: Request) => {
    // Use IP address, with X-Forwarded-For support
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return (req.socket.remoteAddress || 'unknown').toString();
  },
};

export function createRateLimiter(config: Partial<RateLimitConfig> = {}): {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  config: RateLimitConfig;
  store: RateLimitStore;
} {
  const fullConfig: RateLimitConfig = { ...defaultConfig, ...config };
  const store: RateLimitStore = {};

  // Cleanup interval - remove expired entries every minute
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const key of Object.keys(store)) {
      if (store[key].windowStart + fullConfig.windowMs < now) {
        delete store[key];
      }
    }
  }, 60000);

  // Don't keep interval reference in production (would need proper cleanup)
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    cleanupInterval;
  }

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const key = fullConfig.keyGenerator(req);
    const now = Date.now();

    let entry = store[key];
    if (!entry || entry.windowStart + fullConfig.windowMs < now) {
      // New window
      entry = { count: 0, windowStart: now };
      store[key] = entry;
    }

    entry.count += 1;
    const windowEnd = entry.windowStart + fullConfig.windowMs;
    const remaining = Math.max(0, fullConfig.maxRequests - entry.count);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', fullConfig.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(windowEnd / 1000));

    if (entry.count > fullConfig.maxRequests) {
      const retryAfter = Math.ceil((windowEnd - now) / 1000);

      structuredLog({
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
        level: 'warn',
        message: 'Rate limit exceeded',
        metadata: {
          clientKey: key,
          limit: fullConfig.maxRequests,
          retryAfterSeconds: retryAfter,
        },
      });

      res.setHeader('Retry-After', retryAfter.toString());
      res.setHeader('X-RateLimit-Remaining', '0');

      res.status(429).json({
        detail: 'Too many requests. Please slow down and try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        correlation_id: req.correlationId,
        retryAfter,
      });

      return;
    }

    next();
  }

  return {
    middleware,
    config: fullConfig,
    store,
  };
}

/**
 * Apply different rate limits to different routes
 */
export function createScopedRateLimiter(
  routes: Array<{ pattern: string | RegExp; config: Partial<RateLimitConfig> }>
): (req: Request, res: Response, next: NextFunction) => void {
  const limiters = routes.map((r) => ({
    pattern: r.pattern,
    limiter: createRateLimiter(r.config),
  }));

  return (req: Request, res: Response, next: NextFunction): void => {
    for (const { pattern, limiter } of limiters) {
      const path = req.originalUrl || req.url;
      if (typeof pattern === 'string' ? path.startsWith(pattern) : pattern.test(path)) {
        limiter.middleware(req, res, next);
        return;
      }
    }
    next();
  };
}

/**
 * Stricter rate limits for sensitive operations
 */
export const sensitiveOperationLimiter = createRateLimiter({
  windowMs: 300000, // 5 minutes
  maxRequests: 10,
  keyGenerator: (req: Request) => {
    // Use IP + endpoint for sensitive operations
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || (req.socket.remoteAddress || 'unknown').toString();
    return `${ip}:${req.method}:${req.originalUrl || req.url}`;
  },
});

/**
 * Document upload rate limit (prevent flooding)
 */
export const uploadLimiter = createRateLimiter({
  windowMs: 3600000, // 1 hour
  maxRequests: 20,
  keyGenerator: (req: Request) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || (req.socket.remoteAddress || 'unknown').toString();
    return `${ip}:upload`;
  },
});
