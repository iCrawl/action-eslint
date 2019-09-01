import { join, extname } from 'path';
import { ChecksUpdateParamsOutputAnnotations, ChecksCreateParams } from '@octokit/rest';
import { GitHub, context } from '@actions/github';
import { getInput, setFailed, debug } from '@actions/core';

const { GITHUB_TOKEN, GITHUB_SHA, GITHUB_WORKSPACE } = process.env;

const ACTION_NAME = 'ESLint';
const EXTENSIONS = new Set(['.ts', '.js']);

async function lint(files: string[] | null) {
	const { CLIEngine } = await import(join(process.cwd(), 'node_modules/eslint')) as typeof import('eslint');
	const cli = new CLIEngine({
		extensions: [...EXTENSIONS],
		ignorePath: '.gitignore'
	});
	const report = cli.executeOnFiles(files || ['src']);
	const { results, errorCount, warningCount } = report;
	const levels: ChecksUpdateParamsOutputAnnotations['annotation_level'][] = ['notice', 'warning', 'failure'];
	const annotations: ChecksUpdateParamsOutputAnnotations[] = [];
	const consoleOutput: string[] = [];
	const consoleLevels = [, 'warning', 'error'];
	for (const res of results) {
		const { filePath, messages } = res;
		const path = filePath.substring(GITHUB_WORKSPACE!.length + 1);
		for (const msg of messages) {
			const { line, endLine, column, endColumn, severity, ruleId, message } = msg;
			const annotationLevel = levels[severity];
			const consoleLevel = consoleLevels[severity];
			annotations.push({
				path,
				start_line: line,
				end_line: endLine || line,
				start_column: column,
				end_column: endColumn || column,
				annotation_level: annotationLevel,
				title: ruleId || ACTION_NAME,
				message: `${message}${ruleId ? `\nhttps://eslint.org/docs/rules/${ruleId}` : ''}`
			});
			consoleOutput.push(`${path}\n`);
			consoleOutput.push(`##[${consoleLevel}]  ${line}:${column}  ${consoleLevel}  ${message}  ${ruleId}\n\n`);
		}
	}
	console.log(consoleOutput.join(''));

	return {
		conclusion: errorCount > 0 ? 'failure' : 'success' as ChecksCreateParams['conclusion'],
		output: {
			title: ACTION_NAME,
			summary: `${errorCount} error(s), ${warningCount} warning(s) found`,
			annotations
		}
	};
}

async function run() {
	const octokit = new GitHub(GITHUB_TOKEN!);

	let currentSha: string;
	let info;
	let lintFiles;
	if (context.issue && context.issue.number) {
		info = await octokit.graphql(`query($owner: String!, $name: String!, $prNumber: Int!) {
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
			prNumber: context.issue.number
		});
		currentSha = info.repository.pullRequest.commits.nodes[0].commit.oid;
		const files = info.repository.pullRequest.files.nodes;
		lintFiles = files.filter((file: { path: string }) => EXTENSIONS.has(extname(file.path)) && !file.path.includes('.d.ts')).map((f: { path: string }) => f.path);
	} else {
		info = await octokit.repos.getCommit({ owner: context.repo.owner, repo: context.repo.repo, ref: GITHUB_SHA! });
		currentSha = GITHUB_SHA!;
		const files = info.data.files;
		lintFiles = files.filter(file => EXTENSIONS.has(extname(file.filename)) && !file.filename.includes('.d.ts') && file.status !== 'removed' && file.status !== 'changed').map(f => f.filename);
	}
	debug(`Commit: ${currentSha}`);

	let id: number | undefined;
	const jobName = getInput('job-name');
	if (jobName) {
		const checks = await octokit.checks.listForRef({
			...context.repo,
			status: 'in_progress',
			ref: currentSha
		});
		const check = checks.data.check_runs.find(({ name }) => name.toLowerCase() === jobName.toLowerCase());
		if (check) id = check.id;
	}
	if (!id) {
		id = (await octokit.checks.create({
			...context.repo,
			name: ACTION_NAME,
			head_sha: currentSha,
			status: 'in_progress',
			started_at: new Date().toISOString()
		})).data.id;
	}

	try {
		const lintAll = getInput('lint-all');
		const { conclusion, output } = await lint(lintAll ? null : lintFiles);
		await octokit.checks.update({
			...context.repo,
			check_run_id: id,
			completed_at: new Date().toISOString(),
			conclusion,
			output
		});
		debug(output.summary);
		if (conclusion === 'failure') setFailed(output.summary);
	} catch (error) {
		await octokit.checks.update({
			...context.repo,
			check_run_id: id,
			conclusion: 'failure',
			completed_at: new Date().toISOString()
		});
		setFailed(error.message);
	}
}

run();
