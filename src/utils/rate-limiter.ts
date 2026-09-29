export interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxConcurrent: number;
}

export const DEFAULT_RATE_LIMITS: RateLimiterConfig = {
  maxRequestsPerMinute: 50,
  maxTokensPerMinute: 100000,
  maxConcurrent: 5,
};

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly requestHistory: RequestRecord[] = [];
  private activeRequests = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };
  }

  async acquire(estimatedTokens = 1000): Promise<void> {
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
      throw new Error('estimatedTokens must be a non-negative finite number');
    }

    if (estimatedTokens > this.config.maxTokensPerMinute) {
      throw new Error('estimatedTokens exceeds maxTokensPerMinute');
    }

    while (!this.canProceed(estimatedTokens)) {
      this.pruneOldRecords();

      const oldest = this.requestHistory[0]?.timestamp;
      if (oldest === undefined && this.activeRequests >= this.config.maxConcurrent) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        continue;
      }

      const waitMs = oldest === undefined
        ? 50
        : Math.min(Math.max(oldest + 60_000 - Date.now() + 10, 10), 5_000);

      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }

    this.activeRequests += 1;
    this.requestHistory.push({
      timestamp: Date.now(),
      tokens: estimatedTokens,
    });
  }

  release(actualTokens?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    if (actualTokens !== undefined && this.requestHistory.length > 0) {
      const last = this.requestHistory[this.requestHistory.length - 1];
      if (last) {
        last.tokens = Math.max(0, actualTokens);
      }
    }
  }

  async waitForSlot(): Promise<void> {
    await this.acquire();
  }

  getStatus() {
    this.pruneOldRecords();

    const tokensInWindow = this.requestHistory.reduce(
      (sum, record) => sum + record.tokens,
      0,
    );

    return {
      activeRequests: this.activeRequests,
      requestsInWindow: this.requestHistory.length,
      tokensInWindow,
      availableRequests: Math.max(
        0,
        this.config.maxRequestsPerMinute - this.requestHistory.length,
      ),
      availableTokens: Math.max(
        0,
        this.config.maxTokensPerMinute - tokensInWindow,
      ),
    };
  }

  canProceed(estimatedTokens = 1000): boolean {
    this.pruneOldRecords();

    const tokensInWindow = this.requestHistory.reduce(
      (sum, record) => sum + record.tokens,
      0,
    );

    return (
      this.activeRequests < this.config.maxConcurrent &&
      this.requestHistory.length < this.config.maxRequestsPerMinute &&
      tokensInWindow + estimatedTokens <= this.config.maxTokensPerMinute
    );
  }

  private pruneOldRecords(): void {
    const cutoff = Date.now() - 60_000;

    while (
      this.requestHistory.length > 0 &&
      this.requestHistory[0]!.timestamp <= cutoff
    ) {
      this.requestHistory.shift();
    }
  }
}

export async function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens = 1000,
): Promise<T> {
  await rateLimiter.acquire(estimatedTokens);

  try {
    return await fn();
  } finally {
    rateLimiter.release();
  }
}

export const globalRateLimiter = new RateLimiter();
