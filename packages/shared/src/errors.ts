// Machine-readable error codes shared across services.
export const ErrorCode = {
  VALIDATION: 'VALIDATION_ERROR',
  AUTH: 'AUTH_ERROR',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY: 'IDEMPOTENCY_CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  PROVIDER: 'PROVIDER_ERROR',
  TIMEOUT: 'TIMEOUT',
  INTERNAL: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base application error. `isOperational` marks expected/handled errors
 * (vs programmer bugs) so the top-level handler can decide what to leak.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    httpStatus: number,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, new.target);
  }

  /** Safe shape for an HTTP error response body. */
  toJSON(): { code: ErrorCode; message: string; details?: unknown } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(ErrorCode.VALIDATION, 400, message, details);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication failed', details?: unknown) {
    super(ErrorCode.AUTH, 401, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(ErrorCode.FORBIDDEN, 403, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(ErrorCode.NOT_FOUND, 404, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(ErrorCode.CONFLICT, 409, message, details);
  }
}

export class IdempotencyError extends AppError {
  constructor(message = 'Idempotency key conflict', details?: unknown) {
    super(ErrorCode.IDEMPOTENCY, 409, message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details?: unknown) {
    super(ErrorCode.RATE_LIMIT, 429, message, details);
  }
}

export class ProviderError extends AppError {
  constructor(message = 'Upstream provider error', details?: unknown) {
    super(ErrorCode.PROVIDER, 502, message, details);
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'Operation timed out', details?: unknown) {
    super(ErrorCode.TIMEOUT, 504, message, details);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(ErrorCode.INTERNAL, 500, message, details, false);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
