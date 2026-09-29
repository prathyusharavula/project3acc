import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';
import { logger } from './utils/logger.js';
import { formatError } from './utils/error-handler.js';

dotenv.config();

interface CliArguments {
  owner: string;
  repo: string;
  prNumber: number;
}

function validateEnvironment(): void {
  const hasAnthropicApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasAwsCredentials =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY);
  const hasAwsRegion = Boolean(process.env.AWS_REGION);
  const model = process.env.ANTHROPIC_MODEL;

  if (!hasAnthropicApiKey && !hasAwsCredentials) {
    throw new Error(
      'Authentication is not configured. Set ANTHROPIC_API_KEY, or set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION for AWS Bedrock.',
    );
  }

  if (hasAwsCredentials && !hasAwsRegion) {
    throw new Error(
      'AWS credentials are configured, but AWS_REGION is missing.',
    );
  }

  if (!model?.trim()) {
    throw new Error(
      'ANTHROPIC_MODEL is required. Set it to the Claude model identifier you want to use.',
    );
  }

  if (!process.env.GITHUB_TOKEN?.trim()) {
    console.warn(
      'Warning: GITHUB_TOKEN is not set. GitHub MCP operations may fail.',
    );
  }

  if (hasAnthropicApiKey) {
    console.log('🔐 Using Anthropic API authentication');
  } else {
    console.log('🔐 Using AWS Bedrock authentication');
  }
}

function parseArguments(argv: string[]): CliArguments {
  if (argv.length !== 3) {
    throw new Error(
      'Usage: npm run dev -- <owner> <repo> <pr-number>',
    );
  }

  const [owner, repo, prNumberText] = argv;

  if (!owner?.trim() || !repo?.trim()) {
    throw new Error('Repository owner and repository name are required.');
  }

  if (!prNumberText || !/^[1-9]\d*$/.test(prNumberText)) {
    throw new Error('PR number must be a positive integer.');
  }

  const prNumber = Number(prNumberText);

  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
    throw new Error('PR number must be a positive integer.');
  }

  return {
    owner: owner.trim(),
    repo: repo.trim(),
    prNumber,
  };
}

async function main(): Promise<void> {
  try {
    validateEnvironment();
    const { owner, repo, prNumber } = parseArguments(process.argv.slice(2));

    logger.info(`Reviewing PR: ${owner}/${repo}#${prNumber}`);

    const orchestrator = new CodeReviewOrchestrator();
    const result = await orchestrator.reviewPullRequest(
      owner,
      repo,
      prNumber,
    );

    const reportsDir = path.resolve(
      process.env.PROJECT_ROOT || process.cwd(),
      'reports',
    );

    fs.mkdirSync(reportsDir, { recursive: true });

    const reportGenerator = new ReportGenerator();
    const jsonReport = reportGenerator.generateJSONReport(result);
    const markdownReport = reportGenerator.generateMarkdownReport(result);
    const htmlReport = reportGenerator.generateHTMLReport(result);

    const prBaseName = `${owner}_${repo}_${prNumber}`;

    fs.writeFileSync(
      path.join(reportsDir, 'report.json'),
      jsonReport,
      'utf8',
    );
    fs.writeFileSync(
      path.join(reportsDir, 'report.md'),
      markdownReport,
      'utf8',
    );
    fs.writeFileSync(
      path.join(reportsDir, 'report.html'),
      htmlReport,
      'utf8',
    );

    fs.writeFileSync(
      path.join(reportsDir, `${prBaseName}.json`),
      jsonReport,
      'utf8',
    );
    fs.writeFileSync(
      path.join(reportsDir, `${prBaseName}.md`),
      markdownReport,
      'utf8',
    );
    fs.writeFileSync(
      path.join(reportsDir, `${prBaseName}.html`),
      htmlReport,
      'utf8',
    );

    console.log(
      `Review complete. Overall score: ${result.summary.overallScore}/100`,
    );
    console.log(`Reports written to ${reportsDir}`);
  } catch (error) {
    const message = formatError(error);
    logger.error(`Review failed: ${message}`);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

void main();
