import { describe, expect, it } from 'vitest';
import {
  ErrorCodes,
  ReviewError,
  withRetry,
  withTimeout,
} from '../src/utils/error-handler.js';
import { RateLimiter } from '../src/utils/rate-limiter.js';
import { ReportGenerator } from '../src/utils/report-generator.js';

const report = {
  pullRequest: { owner: 'example', repo: 'repo', number: 1 },
  fileReviews: [{
    file: 'src/example.ts',
    codeQuality: {
      file: 'src/example.ts',
      issues: [],
      overallScore: 95,
      summary: 'No issues found',
    },
    testCoverage: {
      file: 'src/example.ts',
      hasTests: true,
      testFiles: ['tests/example.test.ts'],
      untestedPaths: [],
      coverageEstimate: 90,
      summary: 'Good coverage',
    },
    refactorings: {
      file: 'src/example.ts',
      suggestions: [],
      summary: 'No refactoring needed',
    },
  }],
  summary: {
    totalFiles: 1,
    overallScore: 95,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0,
  },
  recommendations: [],
  metadata: {
    analyzedAt: '2026-01-01T00:00:00.000Z',
    duration: 25,
    agentVersions: {},
  },
};

describe('review utilities', () => {
  it('retries a failed operation and eventually succeeds', async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('temporary failure');
        }
        return 'success';
      },
      3,
      0,
    );

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('throws ReviewError after retries are exhausted', async () => {
    await expect(
      withRetry(async () => {
        throw new Error('permanent failure');
      }, 1, 0),
    ).rejects.toMatchObject({
      code: ErrorCodes.RETRY_EXHAUSTED,
    });
  });

  it('times out a slow operation', async () => {
    await expect(
      withTimeout(
        () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50)),
        5,
      ),
    ).rejects.toBeInstanceOf(ReviewError);

    await expect(
      withTimeout(
        () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50)),
        5,
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.AGENT_TIMEOUT,
    });
  });

  it('allows requests while under configured limits', () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 1000,
      maxConcurrent: 1,
    });

    expect(limiter.canProceed(100)).toBe(true);
  });

  it('tracks acquired request capacity', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 1000,
      maxConcurrent: 2,
    });

    await limiter.acquire(100);
    expect(limiter.getStatus().requestsInWindow).toBe(1);
    expect(limiter.getStatus().activeRequests).toBe(1);

    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(0);
  });

  it('generates JSON, Markdown, and HTML reports', () => {
    const generator = new ReportGenerator();

    const json = generator.generateJSONReport(report);
    const markdown = generator.generateMarkdownReport(report);
    const html = generator.generateHTMLReport(report);

    expect(JSON.parse(json)).toEqual(report);
    expect(markdown).toContain('# 🔍 Code Review Report');
    expect(markdown).toContain('src/example.ts');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Code Review Report');
  });
});
