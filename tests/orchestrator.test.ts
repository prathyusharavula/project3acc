import { describe, expect, it, vi } from 'vitest';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { CodeReviewOrchestrator } from '../src/orchestrator.js';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

const validReviewReport = {
  pullRequest: {
    owner: 'owner',
    repo: 'repo',
    number: 1,
  },
  fileReviews: [
    {
      file: 'src/example.ts',
      codeQuality: {
        file: 'src/example.ts',
        issues: [],
        overallScore: 90,
        summary: 'No significant code quality issues found.',
      },
      testCoverage: {
        file: 'src/example.ts',
        hasTests: true,
        testFiles: ['tests/example.test.ts'],
        untestedPaths: [],
        coverageEstimate: 90,
        summary: 'The changed code has corresponding tests.',
      },
      refactorings: {
        file: 'src/example.ts',
        suggestions: [],
        summary: 'No refactoring opportunities identified.',
      },
    },
  ],
  summary: {
    totalFiles: 1,
    overallScore: 90,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0,
  },
  recommendations: [],
  metadata: {
    analyzedAt: '2026-01-01T00:00:00.000Z',
    duration: 1000,
    agentVersions: {
      'code-quality-analyzer': 'test',
      'test-coverage-analyzer': 'test',
      'refactoring-suggester': 'test',
    },
  },
};

describe('CodeReviewOrchestrator', () => {
  describe('configuration and validation', () => {
    it('initializes with default options', () => {
      const orchestrator = new CodeReviewOrchestrator();
      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });

    it('accepts custom retry, timeout, and rate-limit options', () => {
      const orchestrator = new CodeReviewOrchestrator({
        maxRetries: 1,
        timeoutMs: 5_000,
        requestsPerMinute: 10,
      });

      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });

    it('rejects an empty repository owner', async () => {
      const orchestrator = new CodeReviewOrchestrator();

      await expect(
        orchestrator.reviewPullRequest('', 'repo', 1),
      ).rejects.toThrow('Repository owner and name are required.');
    });

    it('rejects an empty repository name', async () => {
      const orchestrator = new CodeReviewOrchestrator();

      await expect(
        orchestrator.reviewPullRequest('owner', '', 1),
      ).rejects.toThrow('Repository owner and name are required.');
    });

    it('rejects a non-positive PR number', async () => {
      const orchestrator = new CodeReviewOrchestrator();

      await expect(
        orchestrator.reviewPullRequest('owner', 'repo', 0),
      ).rejects.toThrow('Pull request number must be a positive integer.');
    });

    it('rejects a non-integer PR number', async () => {
      const orchestrator = new CodeReviewOrchestrator();

      await expect(
        orchestrator.reviewPullRequest('owner', 'repo', 1.5),
      ).rejects.toThrow('Pull request number must be a positive integer.');
    });
  });

  describe('aggregation', () => {
    it('runs the SDK query and returns the validated ReviewReport', async () => {
      vi.mocked(query).mockImplementation(
        () =>
          ({
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'result',
                structured_output: validReviewReport,
              };
            },
          }) as ReturnType<typeof query>,
      );

      process.env.ANTHROPIC_MODEL = 'test-model';

      const orchestrator = new CodeReviewOrchestrator({
        maxRetries: 0,
        timeoutMs: 5_000,
        requestsPerMinute: 100,
      });

      const result = await orchestrator.reviewPullRequest(
        'owner',
        'repo',
        1,
      );

      expect(result.pullRequest).toEqual({
        owner: 'owner',
        repo: 'repo',
        number: 1,
      });

      expect(result.fileReviews).toHaveLength(1);
      expect(result.fileReviews[0]?.file).toBe('src/example.ts');
      expect(result.summary.totalFiles).toBe(1);
      expect(result.summary.overallScore).toBe(90);

      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('owner/repo#1'),
          options: expect.objectContaining({
            model: 'test-model',
            outputFormat: expect.objectContaining({
              type: 'json_schema',
            }),
          }),
        }),
      );
    });
  });

  describe('integration', () => {
    it.skip('reviews a real public PR when credentials are available', async () => {
      // Manual integration test: enable only with valid Claude and GitHub credentials.
    });
  });
});