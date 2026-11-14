import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      startTime: number;
    }
  }
}

// Structured logging - never logs PII or document content
export interface StructuredLogEntry {
  timestamp: string;
  correlationId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export function structuredLog(entry: StructuredLogEntry): void {
  // Sanitize: never include PII or document content
  const safeEntry = {
    ...entry,
    metadata: entry.metadata ? sanitizeForLogging(entry.metadata) : undefined,
  };
  const line = JSON.stringify(safeEntry);
  if (entry.level === 'error') {
    console.error(line);
  } else if (entry.level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

// Redact sensitive fields from logs
export function sanitizeForLogging(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = [
    'email', 'fullName', 'name', 'ssn', 'phone', 'address', 'birthDate',
    'document', 'content', 'text', 'body', 'payload', 'buffer', 'file',
  ];
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.some((f) => f.toLowerCase() === key.toLowerCase())) {
      redacted[key] = '[REDACTED]'; //eslint-disable-line security/detect-object-injection
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = sanitizeForLogging(value as Record<string, unknown>); //eslint-disable-line security/detect-object-injection
    } else {
      redacted[key] = value; //eslint-disable-line security/detect-object-injection
    }
  }
  return redacted;
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-correlation-id'];
  const correlationId =
    typeof incomingId === 'string' && incomingId.trim()
      ? incomingId.trim()
      : `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  req.correlationId = correlationId;
  req.startTime = Date.now();

  res.setHeader('x-correlation-id', correlationId);
  res.setHeader('x-request-id', correlationId);

  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    structuredLog({
      timestamp: new Date().toISOString(),
      correlationId,
      level: res.statusCode >= 400 ? 'error' : res.statusCode >= 300 ? 'warn' : 'info',
      message: `${req.method} ${req.originalUrl || req.url} ${res.statusCode}`,
      metadata: { durationMs: duration },
    });
  });

  next();
}
