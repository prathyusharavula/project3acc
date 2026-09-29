/**
 * Custom error class for review operations.
 */
export class ReviewError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ReviewError';
    Error.captureStackTrace?.(this, ReviewError);
  }
}

export const ErrorCodes = {
  MISSING_API_KEY: 'MISSING_API_KEY',
  MISSING_GITHUB_TOKEN: 'MISSING_GITHUB_TOKEN',
  INVALID_CONFIG: 'INVALID_CONFIG',
  PR_NOT_FOUND: 'PR_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  AGENT_FAILED: 'AGENT_FAILED',
  STRUCTURED_OUTPUT_FAILED: 'STRUCTURED_OUTPUT_FAILED',
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
): Promise<T> {
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new ReviewError(
      'maxRetries must be a non-negative integer.',
      ErrorCodes.INVALID_CONFIG,
    );
  }

  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new ReviewError(
      'delayMs must be a non-negative finite number.',
      ErrorCodes.INVALID_CONFIG,
    );
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const exponentialDelay = delayMs * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 100);
      await sleep(exponentialDelay + jitter);
    }
  }

  throw new ReviewError(
    `Operation failed after ${maxRetries + 1} attempts.`,
    ErrorCodes.RETRY_EXHAUSTED,
    {
      attempts: maxRetries + 1,
      cause: lastError instanceof Error ? lastError.message : String(lastError),
    },
  );
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out',
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ReviewError(
      'timeoutMs must be a positive finite number.',
      ErrorCodes.INVALID_CONFIG,
    );
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ReviewError(errorMessage, ErrorCodes.AGENT_TIMEOUT, {
          timeoutMs,
        }),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function isReviewError(error: unknown): error is ReviewError {
  return error instanceof ReviewError;
}

export function formatError(error: unknown): string {
  if (isReviewError(error)) {
    return `[${error.code}] ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred.';
}
