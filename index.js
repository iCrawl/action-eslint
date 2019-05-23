const request = require('./request');
const { GITHUB_SHA, GITHUB_EVENT_PATH, GITHUB_TOKEN, GITHUB_WORKSPACE } = process.env;
const event = require(GITHUB_EVENT_PATH);
const { repository: { owner: { login: owner }, name: repo } } = event;

const name = 'ESLint Action Marine';
const headers = {
	'Content-Type': 'application/json',
	Accept: 'application/vnd.github.antiope-preview+json',
	Authorization: `Bearer ${GITHUB_TOKEN}`,
	'User-Agent': 'eslint-action-marine'
};

async function check() {
	const { data: { id } } = await request(`https://api.github.com/repos/${owner}/${repo}/check-runs`, {
		method: 'POST',
		headers,
		body: {
			name,
			head_sha: GITHUB_SHA,
			status: 'in_progress',
			started_at: new Date()
		}
	});

	return id;
}

function lint() {
	const eslint = require('eslint');
	const marine_node = require('eslint-config-marine/node');
	const cli = new eslint.CLIEngine({
		extensions: ['.ts', '.tsx', '.js', '.jsx'],
		ignorePath: '.gitignore',
		baseConfig: marine_node,
	});
	const report = cli.executeOnFiles(['.']);
	const { results, errorCount, warningCount } = report;
	const levels = ['', 'warning', 'failure'];
	const annotations = [];
	for (const res of results) {
		const { filePath, messages } = res;
		const path = filePath.substring(GITHUB_WORKSPACE.length + 1);
		for (const msg of messages) {
			const { line, severity, ruleId, message } = msg;
			const annotationLevel = levels[severity];
			annotations.push({
				path,
				start_line: line,
				end_line: line,
				annotation_level: annotationLevel,
				message: `[${ruleId}] ${message}`
			});
		}
	}

	return {
		conclusion: errorCount > 0 ? 'failure' : 'success',
		output: {
			title: name,
			summary: `${errorCount} error(s), ${warningCount} warning(s) found`,
			annotations
		}
	};
}

async function update(id, conclusion, output) {
	await request(`https://api.github.com/repos/${owner}/${repo}/check-runs/${id}`, {
		method: 'PATCH',
		headers,
		body: {
			name,
			head_sha: GITHUB_SHA,
			status: 'completed',
			completed_at: new Date(),
			conclusion,
			output
		}
	});
}

async function run() {
	const id = await check();
	try {
		const { conclusion, output } = lint();
		console.log(output.summary);
		await update(id, conclusion, output);
		if (conclusion === 'failure') process.exit(1);
	} catch (error) {
		await update(id, 'failure');
	}
}

run();
