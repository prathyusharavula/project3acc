import { query } from '@anthropic-ai/claude-agent-sdk';
import { mcpServersConfig } from './config/mcp.config.js';
import { reviewAgents } from './agents/index.js';
import {
  ReviewReportSchema,
  ReviewReportJSONSchema,
  type ReviewReport,
} from './types/report-types.js';
import {
  withRetry,
  withTimeout,
  withRateLimit,
  RateLimiter,
} from './utils/index.js';
import { orchestratorPrompt } from './prompts/orchestrator.prompt.js';

export interface OrchestratorOptions {
  maxRetries?: number;
  timeoutMs?: number;
  requestsPerMinute?: number;
}

export class CodeReviewOrchestrator {
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly rateLimiter: RateLimiter;

  constructor(options: OrchestratorOptions = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 600_000;
    this.rateLimiter = new RateLimiter({
      maxRequestsPerMinute: options.requestsPerMinute ?? 30,
    });
  }

  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<ReviewReport> {
    if (!owner.trim() || !repo.trim()) {
      throw new Error('Repository owner and name are required.');
    }

    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error('Pull request number must be a positive integer.');
    }

    const prompt = orchestratorPrompt(owner, repo, prNumber);

    const result = await withRateLimit(
      this.rateLimiter,
      () =>
        withRetry(
          () =>
            withTimeout(
              () => this.runReview(prompt),
              this.timeoutMs,
              'Code review timed out',
            ),
          this.maxRetries,
        ),
    );

    return ReviewReportSchema.parse(result);
  }

  private async runReview(prompt: string): Promise<unknown> {
    let finalResult: unknown;

    for await (const message of query({
      prompt,
      options: {
        model: process.env.ANTHROPIC_MODEL,
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema,
        },
        agents: reviewAgents,
        mcpServers: mcpServersConfig,
        allowedTools: ['Task', 'Read', 'Grep', 'Glob', 'Skill','mcp__github__*','mcp__eslint__*',],
        permissionMode: 'bypassPermissions',
      },
    })) {
      if (
        message.type === 'result' &&
        'structured_output' in message &&
        message.structured_output !== undefined
      ) {
        finalResult = message.structured_output;
      }
    }

    if (finalResult === undefined) {
      throw new Error('Claude Agent SDK returned no structured review report.');
    }

    return finalResult;
  }
}