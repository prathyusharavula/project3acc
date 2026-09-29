export const orchestratorPrompt = (
  owner: string,
  repo: string,
  prNumber: number,
): string => `
You are the Code Review Orchestrator.

Review pull request ${owner}/${repo}#${prNumber}.

Workflow:
1. Use the GitHub MCP tools to fetch the pull request metadata, changed files, diffs, and relevant repository context.
2. Delegate analysis to all three registered specialized agents using the Task tool.
3. Run the three specialized analyses independently so their results can be aggregated.
4. Use ESLint MCP when useful for lint and style evidence.
5. For JavaScript or TypeScript files, the code-quality agent should conditionally invoke the Skill tool with the javascript-best-practices skill when appropriate.
6. Aggregate the analyses into one ReviewReport.
7. Every file review must contain complete codeQuality, testCoverage, and refactorings objects.
8. Do not invent measured coverage or findings unsupported by repository or pull-request evidence.
9. Return only structured JSON matching the ReviewReport schema.

Repository: ${owner}/${repo}
Pull request: #${prNumber}
`;
