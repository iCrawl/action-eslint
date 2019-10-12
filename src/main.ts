import { debug, getInput, setFailed, warning } from '@actions/core';
import { context, GitHub } from '@actions/github';
import { extname, join } from 'path';
import * as table from 'text-table';

const { GITHUB_TOKEN, GITHUB_SHA } = process.env;

const EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx']);

async function lint(files?: string[], lintAll?: string, customGlob?: string) {
	const { CLIEngine } = (await import(join(process.cwd(), 'node_modules/eslint'))) as typeof import('eslint');
	const cli = new CLIEngine({
		extensions: [...EXTENSIONS],
		ignorePath: '.gitignore',
	});
	let filesToLint = files || ['src']; // Default fallback
	if (lintAll) {
		filesToLint = ['src'];
	}
	if (customGlob) {
		filesToLint = customGlob.split(',');
	}
	const report = cli.executeOnFiles(filesToLint);
	const { results, errorCount, warningCount } = report;
	const output = new Map<string, string[]>();
	const consoleLevels = [, 'warning', 'error'];
	for (const res of results) {
		const { filePath, messages } = res;
		for (const msg of messages) {
			const { line, column, severity, ruleId, message } = msg;
			const consoleLevel = consoleLevels[severity];
			const hasPath = output.get(filePath);
			if (hasPath) {
				hasPath.push(`  ${line}:${column}  ${consoleLevel}  ${message}  ${ruleId || ''}\n`);
				output.set(filePath, hasPath);
			} else {
				output.set(filePath, [`${filePath}\n`, `  ${line}:${column}  ${consoleLevel}  ${message}  ${ruleId || ''}\n`]);
			}
		}
	}
	let consoleOut = '\n';
	for (const [k, v] of output) {
		consoleOut += `${k}\n`;
		consoleOut += `${table([v.slice(1)], { align: ['r', 'l'] })}\n`;
	}
	if (consoleOut) console.log(consoleOut);

	return {
		conclusion: errorCount > 0 ? 'failure' : 'success',
		summary: `✖ ${errorCount} error(s), ${warningCount} warning(s) found`,
	};
}

async function run() {
	const matcher = join(__dirname, '..', '.github', 'eslint.json');
	console.log(`##[add-matcher]${matcher}`);
	const octokit = new GitHub(GITHUB_TOKEN!);

	let currentSha: string;
	let info;
	let lintFiles;
	if (context.issue && context.issue.number) {
		try {
			info = await octokit.graphql(
				`query($owner: String!, $name: String!, $prNumber: Int!) {
					repository(owner: $owner, name: $name) {
						pullRequest(number: $prNumber) {
							files(first: 100) {
								nodes {
									path
								}
							}
							commits(last: 1) {
								nodes {
									commit {
										oid
									}
								}
							}
						}
					}
				}`,
				{
					owner: context.repo.owner,
					name: context.repo.repo,
					prNumber: context.issue.number,
				},
			);
		} catch {
			warning("Token doesn't have permission to access this resource. Running lint over custom glob or all files.");
		}
		if (info) {
			currentSha = info.repository.pullRequest.commits.nodes[0].commit.oid;
			const files = info.repository.pullRequest.files.nodes;
			lintFiles = files
				.filter((file: { path: string }) => EXTENSIONS.has(extname(file.path)) && !file.path.includes('.d.ts'))
				.map((f: { path: string }) => f.path);
		} else {
			currentSha = GITHUB_SHA!;
		}
	} else {
		try {
			info = await octokit.repos.getCommit({ owner: context.repo.owner, repo: context.repo.repo, ref: GITHUB_SHA! });
		} catch {
			warning("Token doesn't have permission to access this resource. Running lint over custom glob or all files.");
		}
		if (info) {
			const files = info.data.files;
			lintFiles = files
				.filter(
					file =>
						EXTENSIONS.has(extname(file.filename)) &&
						!file.filename.includes('.d.ts') &&
						file.status !== 'removed' &&
						file.status !== 'changed',
				)
				.map(f => f.filename);
		}
		currentSha = GITHUB_SHA!;
	}
	debug(`Commit: ${currentSha}`);

	try {
		const lintAll = getInput('lint-all');
		const customGlob = getInput('custom-glob');
		const { conclusion, summary } = await lint(lintFiles, lintAll, customGlob);

		if (conclusion === 'failure') setFailed(summary);
	} catch (e) {
		setFailed(e.message);
	}
}

run();
