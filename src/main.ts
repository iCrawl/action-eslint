import { join } from 'path';
import { exec } from '@actions/exec';
import { getInput, setFailed } from '@actions/core';

async function run() {
	try {
		const customGlob = getInput('custom-glob');
		console.log(`##[add-matcher]${join(__dirname, '..', '.github', 'eslint-stylish.json')}`);
		const args = [`${join(process.cwd(), 'node_modules/eslint/bin/eslint')}`, '--ext', 'js,jsx,ts,tsx', customGlob];
		await exec('node', args);
	} catch {
		setFailed('');
	}
}

void run();
