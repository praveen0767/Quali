import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const correlationId = req.correlationId || 'unknown';
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let detail = err.message || 'An unexpected internal error occurred in the Quali verification engine.';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    detail = err.message;
  } else if ('status' in err && typeof (err as { status: unknown }).status === 'number') {
    statusCode = (err as { status: number }).status;
  }

  // Multer error handling
  if (err.name === 'MulterError') {
    statusCode = 400;
    code = 'UPLOAD_ERROR';
    if (err.message.includes('File too large')) {
      code = 'FILE_TOO_LARGE';
      detail = 'Uploaded document exceeds the 25MB Zero-Leak Enclave storage limit.';
    }
  }

  console.error(`[Error] [${correlationId}] ${statusCode} ${code}: ${detail}`, err.stack);

  res.status(statusCode).json({
    detail,
    code,
    correlation_id: correlationId,
    ...(err instanceof AppError && err.details ? { meta: err.details } : {}),
  });
}
