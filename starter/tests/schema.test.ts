import { describe, expect, it } from 'vitest';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
} from '../src/types/analysis-results.js';
import { ReviewReportSchema } from '../src/types/report-types.js';

const validReport = {
  pullRequest: { owner: 'example', repo: 'repo', number: 1 },
  fileReviews: [{
    file: 'src/example.ts',
    codeQuality: {
      file: 'src/example.ts',
      issues: [{
        line: 10,
        severity: 'medium' as const,
        category: 'maintainability' as const,
        description: 'Example issue',
        suggestion: 'Improve the implementation',
      }],
      overallScore: 90,
      summary: 'Good overall quality',
    },
    testCoverage: {
      file: 'src/example.ts',
      hasTests: true,
      testFiles: ['tests/example.test.ts'],
      untestedPaths: [],
      coverageEstimate: 85,
      summary: 'Adequate coverage',
    },
    refactorings: {
      file: 'src/example.ts',
      suggestions: [],
      summary: 'No immediate refactoring required',
    },
  }],
  summary: {
    totalFiles: 1,
    overallScore: 88,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0,
  },
  recommendations: [{
    priority: 'medium' as const,
    category: 'maintainability',
    description: 'Keep the implementation modular.',
    files: ['src/example.ts'],
  }],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 100,
    agentVersions: {},
  },
};

describe('analysis schemas', () => {
  it('accepts valid code-quality results', () => {
    expect(CodeQualityResultSchema.safeParse(validReport.fileReviews[0].codeQuality).success).toBe(true);
  });

  it('rejects an invalid quality score', () => {
    const result = CodeQualityResultSchema.safeParse({
      ...validReport.fileReviews[0].codeQuality,
      overallScore: 101,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid coverage results', () => {
    expect(TestCoverageResultSchema.safeParse(validReport.fileReviews[0].testCoverage).success).toBe(true);
  });

  it('accepts valid refactoring results', () => {
    expect(RefactoringSuggestionSchema.safeParse(validReport.fileReviews[0].refactorings).success).toBe(true);
  });

  it('validates a complete ReviewReport', () => {
    expect(ReviewReportSchema.safeParse(validReport).success).toBe(true);
  });

  it('rejects incomplete file reviews', () => {
    const invalid = structuredClone(validReport);
    delete (invalid.fileReviews[0] as { testCoverage?: unknown }).testCoverage;
    expect(ReviewReportSchema.safeParse(invalid).success).toBe(false);
  });
});
