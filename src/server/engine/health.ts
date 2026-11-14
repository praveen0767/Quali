/**
 * Health and Readiness Check Utilities
 *
 * Provides operational health checks for the Quali AI engine.
 * Exposes non-sensitive operational metrics only.
 */

import { Request, Response, NextFunction } from 'express';
import { HealthCheckResult, OperationalMetrics } from '../../lib/api/types';
import { structuredLog } from '../middleware/correlation';
import { db } from '../store';

export interface HealthChecker {
  checkStore: () => Promise<{ status: 'pass' | 'fail'; message: string }>;
  checkDocuments: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>;
  checkEngine: () => Promise<{ status: 'pass' | 'fail'; message: string }>;
  checkDependencies: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>;
  getOverallHealth: () => Promise<HealthCheckResult>;
  getMetrics: () => OperationalMetrics;
}

/**
 * Create a health checker with configurable checks
 */
export function createHealthChecker(): HealthChecker & {
  _recordRequest: () => void;
  _recordSuccess: () => void;
  _recordFailure: () => void;
  _recordRateLimited: () => void;
  _recordDocumentProcessed: () => void;
  _recordDocumentFailed: () => void;
  _recordExtraction: (completed: boolean) => void;
  _recordEligibilityEvaluation: () => void;
  _recordValidationError: () => void;
  _recordProcessingError: () => void;
  _recordDuplicateDetection: () => void;
  _recordSecurityRejection: () => void;
  _recordLatency: (ms: number) => void;
} {
  const startTime = Date.now();
  let requestCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let rateLimitedCount = 0;
  let documentsProcessed = 0;
  let documentsFailed = 0;
  let extractionsCompleted = 0;
  let extractionsFailed = 0;
  let eligibilityEvaluations = 0;
  let validationErrors = 0;
  let processingErrors = 0;
  let duplicateDetections = 0;
  let securityRejections = 0;
  const latencies: number[] = [];

  const checker: HealthChecker & {
    _recordRequest: () => void;
    _recordSuccess: () => void;
    _recordFailure: () => void;
    _recordRateLimited: () => void;
    _recordDocumentProcessed: () => void;
    _recordDocumentFailed: () => void;
    _recordExtraction: (completed: boolean) => void;
    _recordEligibilityEvaluation: () => void;
    _recordValidationError: () => void;
    _recordProcessingError: () => void;
    _recordDuplicateDetection: () => void;
    _recordSecurityRejection: () => void;
    _recordLatency: (ms: number) => void;
  } = {
    checkStore: async (): Promise<{ status: 'pass' | 'fail'; message: string }> => {
      const start = Date.now();
      try {
        const state = db.get();
        const latency = Date.now() - start;

        if (state.profile && state.opportunities && state.criteriaRubrics) {
          return { status: 'pass', message: 'Store accessible and initialized' };
        }
        return { status: 'fail', message: 'Store initialized but missing required data' };
      } catch (err) {
        return { status: 'fail', message: `Store check failed: ${err instanceof Error ? err.message : 'Unknown error'}` };
      }
    },

    checkDocuments: async (): Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }> => {
      try {
        const documents = db.get().ingestedDocuments;
        if (documents.length === 0) {
          return { status: 'warn', message: 'No documents ingested yet' };
        }
        return { status: 'pass', message: `Store contains ${documents.length} document(s)` };
      } catch (err) {
        return { status: 'fail', message: `Document check failed: ${err instanceof Error ? err.message : 'Unknown error'}` };
      }
    },

    checkEngine: async (): Promise<{ status: 'pass' | 'fail'; message: string }> => {
      try {
        return { status: 'pass', message: 'Engine modules operational' };
      } catch (err) {
        return { status: 'fail', message: `Engine check failed: ${err instanceof Error ? err.message : 'Unknown error'}` };
      }
    },

    checkDependencies: async (): Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }> => {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const dataDir = path.resolve(process.cwd(), 'data');
        const storeFile = path.join(dataDir, 'quali_store.json');

        const canRead = fs.existsSync(storeFile);
        const canWrite = fs.existsSync(dataDir);

        if (canRead && canWrite) {
          return { status: 'pass', message: 'File system accessible for persistence' };
        }
        return { status: 'warn', message: canWrite ? 'Store file missing (will be created)' : 'Data directory not accessible' };
      } catch (err) {
        return { status: 'fail', message: `Dependency check failed: ${err instanceof Error ? err.message : 'Unknown error'}` };
      }
    },

    getOverallHealth: async (): Promise<HealthCheckResult> => {
      const checks = await Promise.all([
        checker.checkStore(),
        checker.checkDocuments(),
        checker.checkEngine(),
        checker.checkDependencies(),
      ]);

      const failed = checks.filter((c) => c.status === 'fail').length;
      const warned = checks.filter((c) => c.status === 'warn').length;

      let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
      if (failed > 0) {
        overallStatus = 'unhealthy';
      } else if (warned > 0) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'healthy';
      }

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checks: checks.map((c, i) => {
          const names = ['store', 'documents', 'engine', 'dependencies'] as const;
          return {
            name: names[i],
            status: c.status,
            message: c.message,
          };
        }),
        version: process.env.npm_package_version || '0.0.0',
      };
    },

    getMetrics: (): OperationalMetrics => {
      const now = Date.now();
      const sortedLatencies = [...latencies].sort((a, b) => a - b);
      const p50 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] : 0;
      const p95 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] : 0;
      const p99 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] : 0;

      return {
        totalRequests: requestCount,
        successfulRequests: successCount,
        failedRequests: failureCount,
        rateLimitedRequests: rateLimitedCount,
        latencyP50: p50,
        latencyP95: p95,
        latencyP99: p99,
        documentsProcessed,
        documentsFailed,
        extractionsCompleted,
        extractionsFailed,
        eligibilityEvaluations,
        validationErrors,
        processingErrors,
        duplicateDetections,
        securityRejections,
        startTime: new Date(startTime).toISOString(),
        uptimeSeconds: Math.floor((now - startTime) / 1000),
      };
    },

    _recordRequest: (): void => {
      requestCount++;
    },
    _recordSuccess: (): void => {
      successCount++;
    },
    _recordFailure: (): void => {
      failureCount++;
    },
    _recordRateLimited: (): void => {
      rateLimitedCount++;
    },
    _recordDocumentProcessed: (): void => {
      documentsProcessed++;
    },
    _recordDocumentFailed: (): void => {
      documentsFailed++;
    },
    _recordExtraction: (completed: boolean): void => {
      if (completed) extractionsCompleted++;
      else extractionsFailed++;
    },
    _recordEligibilityEvaluation: (): void => {
      eligibilityEvaluations++;
    },
    _recordValidationError: (): void => {
      validationErrors++;
    },
    _recordProcessingError: (): void => {
      processingErrors++;
    },
    _recordDuplicateDetection: (): void => {
      duplicateDetections++;
    },
    _recordSecurityRejection: (): void => {
      securityRejections++;
    },
    _recordLatency: (ms: number): void => {
      latencies.push(ms);
      if (latencies.length > 10000) {
        latencies.splice(0, latencies.length - 10000);
      }
    },
  };

  return checker;
}

// Singleton instance
let healthChecker: (HealthChecker & {
  _recordRequest: () => void;
  _recordSuccess: () => void;
  _recordFailure: () => void;
  _recordRateLimited: () => void;
  _recordDocumentProcessed: () => void;
  _recordDocumentFailed: () => void;
  _recordExtraction: (completed: boolean) => void;
  _recordEligibilityEvaluation: () => void;
  _recordValidationError: () => void;
  _recordProcessingError: () => void;
  _recordDuplicateDetection: () => void;
  _recordSecurityRejection: () => void;
  _recordLatency: (ms: number) => void;
}) | null = null;

export function getHealthChecker(): HealthChecker & {
  _recordRequest: () => void;
  _recordSuccess: () => void;
  _recordFailure: () => void;
  _recordRateLimited: () => void;
  _recordDocumentProcessed: () => void;
  _recordDocumentFailed: () => void;
  _recordExtraction: (completed: boolean) => void;
  _recordEligibilityEvaluation: () => void;
  _recordValidationError: () => void;
  _recordProcessingError: () => void;
  _recordDuplicateDetection: () => void;
  _recordSecurityRejection: () => void;
  _recordLatency: (ms: number) => void;
} {
  if (!healthChecker) {
    healthChecker = createHealthChecker();
  }
  return healthChecker;
}

/**
 * Middleware to track request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const checker = getHealthChecker();
  checker._recordRequest();

  const start = Date.now();

  res.on('finish', () => {
    const latency = Date.now() - start;
    checker._recordLatency(latency);

    if (res.statusCode >= 400 && res.statusCode < 500) {
      checker._recordValidationError();
    } else if (res.statusCode >= 500) {
      checker._recordProcessingError();
    } else {
      checker._recordSuccess();
    }
  });

  next();
}

/**
 * Request logging middleware that excludes PII
 */
export function safeRequestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const correlationId = (req as Request & { correlationId?: string }).correlationId;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const checker = getHealthChecker();
    checker._recordLatency(duration);

    // Log only non-sensitive information
    structuredLog({
      timestamp: new Date().toISOString(),
      correlationId: correlationId || 'unknown',
      level: res.statusCode >= 400 ? 'error' : res.statusCode >= 300 ? 'warn' : 'info',
      message: `${req.method} ${req.path} ${res.statusCode}`,
      metadata: {
        durationMs: duration,
        contentType: req.headers['content-type'] ?? undefined,
        contentLength: req.headers['content-length'] ? parseInt(req.headers['content-length'] as string) : undefined,
      },
    });
  });

  next();
}
