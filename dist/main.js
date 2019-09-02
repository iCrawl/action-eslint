"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const github_1 = require("@actions/github");
const core_1 = require("@actions/core");
const { GITHUB_TOKEN, GITHUB_SHA, GITHUB_WORKSPACE } = process.env;
const ACTION_NAME = 'ESLint';
const EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx']);
async function lint(files) {
    const { CLIEngine } = await Promise.resolve().then(() => require(path_1.join(process.cwd(), 'node_modules/eslint')));
    const cli = new CLIEngine({
        extensions: [...EXTENSIONS],
        ignorePath: '.gitignore'
    });
    const report = cli.executeOnFiles(files || ['src']);
    const { results, errorCount, warningCount } = report;
    const levels = ['notice', 'warning', 'failure'];
    const annotations = [];
    const consoleOutput = [];
    const consoleLevels = [, 'warning', 'error'];
    for (const res of results) {
        const { filePath, messages } = res;
        const path = filePath.substring(GITHUB_WORKSPACE.length + 1);
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
        conclusion: errorCount > 0 ? 'failure' : 'success',
        output: {
            title: ACTION_NAME,
            summary: `${errorCount} error(s), ${warningCount} warning(s) found`,
            annotations
        }
    };
}
async function run() {
    const octokit = new github_1.GitHub(GITHUB_TOKEN);
    let currentSha;
    let info;
    let lintFiles;
    if (github_1.context.issue && github_1.context.issue.number) {
        try {
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
			}`, {
                owner: github_1.context.repo.owner,
                name: github_1.context.repo.repo,
                prNumber: github_1.context.issue.number
            });
        }
        catch {
            console.log('##[warning] Token doesn\'t have permission to access this resource.');
        }
        if (info) {
            currentSha = info.repository.pullRequest.commits.nodes[0].commit.oid;
            const files = info.repository.pullRequest.files.nodes;
            lintFiles = files.filter((file) => EXTENSIONS.has(path_1.extname(file.path)) && !file.path.includes('.d.ts')).map((f) => f.path);
        }
        else {
            currentSha = GITHUB_SHA;
        }
    }
    else {
        try {
            info = await octokit.repos.getCommit({ owner: github_1.context.repo.owner, repo: github_1.context.repo.repo, ref: GITHUB_SHA });
        }
        catch {
            console.log('##[warning] Token doesn\'t have permission to access this resource.');
        }
        if (info) {
            const files = info.data.files;
            lintFiles = files.filter(file => EXTENSIONS.has(path_1.extname(file.filename)) && !file.filename.includes('.d.ts') && file.status !== 'removed' && file.status !== 'changed').map(f => f.filename);
        }
        currentSha = GITHUB_SHA;
    }
    core_1.debug(`Commit: ${currentSha}`);
    let id;
    const jobName = core_1.getInput('job-name');
    if (jobName) {
        try {
            const checks = await octokit.checks.listForRef({
                ...github_1.context.repo,
                status: 'in_progress',
                ref: currentSha
            });
            const check = checks.data.check_runs.find(({ name }) => name.toLowerCase() === jobName.toLowerCase());
            if (check)
                id = check.id;
        }
        catch {
            console.log('##[warning] Token doesn\'t have permission to access this resource.');
        }
    }
    if (!id) {
        try {
            id = (await octokit.checks.create({
                ...github_1.context.repo,
                name: ACTION_NAME,
                head_sha: currentSha,
                status: 'in_progress',
                started_at: new Date().toISOString()
            })).data.id;
        }
        catch (error) {
            console.log('##[warning] Token doesn\'t have permission to access this resource.');
        }
    }
    try {
        const lintAll = core_1.getInput('lint-all');
        const { conclusion, output } = await lint(lintAll ? null : lintFiles);
        if (id) {
            try {
                await octokit.checks.update({
                    ...github_1.context.repo,
                    check_run_id: id,
                    completed_at: new Date().toISOString(),
                    conclusion,
                    output
                });
            }
            catch {
                console.log('##[warning] Token doesn\'t have permission to access this resource.');
            }
        }
        core_1.debug(output.summary);
        if (conclusion === 'failure')
            core_1.setFailed(output.summary);
    }
    catch (error) {
        if (id) {
            try {
                await octokit.checks.update({
                    ...github_1.context.repo,
                    check_run_id: id,
                    conclusion: 'failure',
                    completed_at: new Date().toISOString()
                });
            }
            catch {
                console.log('##[warning] Token doesn\'t have permission to access this resource.');
            }
        }
        core_1.setFailed(error.message);
    }
}
run();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiJzcmMvIiwic291cmNlcyI6WyJtYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0JBQXFDO0FBRXJDLDRDQUFrRDtBQUNsRCx3Q0FBMkQ7QUFFM0QsTUFBTSxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDO0FBRW5FLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQztBQUM3QixNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFFM0QsS0FBSyxVQUFVLElBQUksQ0FBQyxLQUFzQjtJQUN6QyxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsMkNBQWEsV0FBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxFQUE0QixDQUFDO0lBQzFHLE1BQU0sR0FBRyxHQUFHLElBQUksU0FBUyxDQUFDO1FBQ3pCLFVBQVUsRUFBRSxDQUFDLEdBQUcsVUFBVSxDQUFDO1FBQzNCLFVBQVUsRUFBRSxZQUFZO0tBQ3hCLENBQUMsQ0FBQztJQUNILE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxjQUFjLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNwRCxNQUFNLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsR0FBRyxNQUFNLENBQUM7SUFDckQsTUFBTSxNQUFNLEdBQThELENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUMzRyxNQUFNLFdBQVcsR0FBMEMsRUFBRSxDQUFDO0lBQzlELE1BQU0sYUFBYSxHQUFhLEVBQUUsQ0FBQztJQUNuQyxNQUFNLGFBQWEsR0FBRyxDQUFDLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzdDLEtBQUssTUFBTSxH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S0FDekI7QUFDRixDQUFDO0FBRUQsR0FBRyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBqb2luLCBleHRuYW1lIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBDaGVja3NVcGRhdGVQYXJhbXNPdXRwdXRBbm5vdGF0aW9ucywgQ2hlY2tzQ3JlYXRlUGFyYW1zIH0gZnJvbSAnQG9jdG9raXQvcmVzdCc7XG5pbXBvcnQgeyBHaXRIdWIsIGNvbnRleHQgfSBmcm9tICdAYWN0aW9ucy9naXRodWInO1xuaW1wb3J0IHsgZ2V0SW5wdXQsIHNldEZhaWxlZCwgZGVidWcgfSBmcm9tICdAYWN0aW9ucy9jb3JlJztcblxuY29uc3QgeyBHSVRIVUJfVE9LRU4sIEdJVEhVQl9TSEEsIEdJVEhVQl9XT1JLU1BBQ0UgfSA9IHByb2Nlc3MuZW52O1xuXG5jb25zdCBBQ1RJT05fTkFNRSA9ICdFU0xpbnQnO1xuY29uc3QgRVhURU5TSU9OUyA9IG5ldyBTZXQoWycudHMnLCAnLmpzJywgJy50c3gnLCAnLmpzeCddKTtcblxuYXN5bmMgZnVuY3Rpb24gbGludChmaWxlczogc3RyaW5nW10gfCBudWxsKSB7XG5cdGNvbnN0IHsgQ0xJRW5naW5lIH0gPSBhd2FpdCBpbXBvcnQoam9pbihwcm9jZXNzLmN3ZCgpLCAnbm9kZV9tb2R1bGVzL2VzbGludCcpKSBhcyB0eXBlb2YgaW1wb3J0KCdlc2xpbnQnKTtcblx0Y29uc3QgY2xpID0gbmV3IENMSUVuZ2luZSh7XG5cdFx0ZXh0ZW5zaW9uczogWy4uLkVYVEVOU0lPTlNdLFxuXHRcdGlnbm9yZVBhdGg6ICcuZ2l0aWdub3JlJ1xuXHR9KTtcblx0Y29uc3QgcmVwb3J0ID0gY2xpLmV4ZWN1dGVPbkZpbGVzKGZpbGVzIHx8IFsnc3JjJ10pO1xuXHRjb25zdCB7IHJlc3VsdHMsIGVycm9yQ291bnQsIHdhcm5pbmdDb3VudCB9ID0gcmVwb3J0O1xuXHRjb25zdCBsZXZlbHM6IENoZWNrc1VwZGF0ZVBhcmFtc091dHB1dEFubm90YXRpb25zWydhbm5vdGF0aW9uX2xldmVsJ11bXSA9IFsnbm90aWNlJywgJ3dhcm5pbmcnLCAnZmFpbHVyZSddO1xuXHRjb25zdCBhbm5vdGF0aW9uczogQ2hlY2tzVXBkYXRlUGFyYW1zT3V0cHV0QW5ub3RhdGlvbnNbXSA9IFtdO1xuXHRjb25zdCBjb25zb2xlT3V0cHV0OiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBjb25zb2xlTGV2ZWxzID0gWywgJ3dhcm5pbmcnLCAnZXJyb3InXTtcblx0Zm9yIChjb25zdCByZXMgb2YgcmVzdWx0cykge1xuXHRcdGNvbnN0IHsgZmlsZVBhdGgsIG1lc3NhZ2VzIH0gPSByZXM7XG5cdFx0Y29uc3QgcGF0aCA9IGZpbGVQYXRoLnN1YnN0cmluZyhHSVRIVUJfV09SS1NQQUNFIS5sZW5ndGggKyAxKTtcblx0XHRmb3IgKGNvbnN0IG1zZyBvZiBtZXNzYWdlcykge1xuXHRcdFx0Y29uc3QgeyBsaW5lLCBlbmRMaW5lLCBjb2x1bW4sIGVuZENvbHVtbiwgc2V2ZXJpdHksIHJ1bGVJZCwgbWVzc2FnZSB9ID0gbXNnO1xuXHRcdFx0Y29uc3QgYW5ub3RhdGlvbkxldmVsID0gbGV2ZWxzW3NldmVyaXR5XTtcblx0XHRcdGNvbnN0IGNvbnNvbGVMZXZlbCA9IGNvbnNvbGVMZXZlbHNbc2V2ZXJpdHldO1xuXHRcdFx0YW5ub3RhdGlvbnMucHVzaCh7XG5cdFx0XHRcdHBhdGgsXG5cdFx0XHRcdHN0YXJ0X2xpbmU6IGxpbmUsXG5cdFx0XHRcdGVuZF9saW5lOiBlbmRMaW5lIHx8IGxpbmUsXG5cdFx0XHRcdHN0YXJ0X2NvbHVtbjogY29sdW1uLFxuXHRcdFx0XHRlbmRfY29sdW1uOiBlbmRDb2x1bW4gfHwgY29sdW1uLFxuXHRcdFx0XHRhbm5vdGF0aW9uX2xldmVsOiBhbm5vdGF0aW9uTGV2ZWwsXG5cdFx0XHRcdHRpdGxlOiBydWxlSWQgfHwgQUNUSU9OX05BTUUsXG5cdFx0XHRcdG1lc3NhZ2U6IGAke21lc3NhZ2V9JHtydWxlSWQgPyBgXFxuaHR0cHM6Ly9lc2xpbnQub3JnL2RvY3MvcnVsZXMvJHtydWxlSWR9YCA6ICcnfWBcblx0XHRcdH0pO1xuXHRcdFx0Y29uc29sZU91dHB1dC5wdXNoKGAke3BhdGh9XFxuYCk7XG5cdFx0XHRjb25zb2xlT3V0cHV0LnB1c2goYCMjWyR7Y29uc29sZUxldmVsfV0gICR7bGluZX06JHtjb2x1bW59ICAke2NvbnNvbGVMZXZlbH0gICR7bWVzc2FnZX0gICR7cnVsZUlkfVxcblxcbmApO1xuXHRcdH1cblx0fVxuXHRjb25zb2xlLmxvZyhjb25zb2xlT3V0cHV0LmpvaW4oJycpKTtcblxuXHRyZXR1cm4ge1xuXHRcdGNvbmNsdXNpb246IGVycm9yQ291bnQgPiAwID8gJ2ZhaWx1cmUnIDogJ3N1Y2Nlc3MnIGFzIENoZWNrc0NyZWF0ZVBhcmFtc1snY29uY2x1c2lvbiddLFxuXHRcdG91dHB1dDoge1xuXHRcdFx0dGl0bGU6IEFDVElPTl9OQU1FLFxuXHRcdFx0c3VtbWFyeTogYCR7ZXJyb3JDb3VudH0gZXJyb3IocyksICR7d2FybmluZ0NvdW50fSB3YXJuaW5nKHMpIGZvdW5kYCxcblx0XHRcdGFubm90YXRpb25zXG5cdFx0fVxuXHR9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBydW4oKSB7XG5cdGNvbnN0IG9jdG9raXQgPSBuZXcgR2l0SHViKEdJVEhVQl9UT0tFTiEpO1xuXG5cdGxldCBjdXJyZW50U2hhOiBzdHJpbmc7XG5cdGxldCBpbmZvO1xuXHRsZXQgbGludEZpbGVzO1xuXHRpZiAoY29udGV4dC5pc3N1ZSAmJiBjb250ZXh0Lmlzc3VlLm51bWJlcikge1xuXHRcdHRyeSB7XG5cdFx0XHRpbmZvID0gYXdhaXQgb2N0b2tpdC5ncmFwaHFsKGBxdWVyeSgkb3duZXI6IFN0cmluZyEsICRuYW1lOiBTdHJpbmchLCAkcHJOdW1iZXI6IEludCEpIHtcblx0XHRcdFx0cmVwb3NpdG9yeShvd25lcjogJG93bmVyLCBuYW1lOiAkbmFtZSkge1xuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0KG51bWJlcjogJHByTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRmaWxlcyhmaXJzdDogMTAwKSB7XG5cdFx0XHRcdFx0XHRcdG5vZGVzIHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbW1pdHMobGFzdDogMSkge1xuXHRcdFx0XHRcdFx0XHRub2RlcyB7XG5cdFx0XHRcdFx0XHRcdFx0Y29tbWl0IHtcblx0XHRcdFx0XHRcdFx0XHRcdG9pZFxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fWAsXG5cdFx0XHR7XG5cdFx0XHRcdG93bmVyOiBjb250ZXh0LnJlcG8ub3duZXIsXG5cdFx0XHRcdG5hbWU6IGNvbnRleHQucmVwby5yZXBvLFxuXHRcdFx0XHRwck51bWJlcjogY29udGV4dC5pc3N1ZS5udW1iZXJcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Y29uc29sZS5sb2coJyMjW3dhcm5pbmddIFRva2VuIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gYWNjZXNzIHRoaXMgcmVzb3VyY2UuJyk7XG5cdFx0fVxuXHRcdGlmIChpbmZvKSB7XG5cdFx0XHRjdXJyZW50U2hhID0gaW5mby5yZXBvc2l0b3J5LnB1bGxSZXF1ZXN0LmNvbW1pdHMubm9kZXNbMF0uY29tbWl0Lm9pZDtcblx0XHRcdGNvbnN0IGZpbGVzID0gaW5mby5yZXBvc2l0b3J5LnB1bGxSZXF1ZXN0LmZpbGVzLm5vZGVzO1xuXHRcdFx0bGludEZpbGVzID0gZmlsZXMuZmlsdGVyKChmaWxlOiB7IHBhdGg6IHN0cmluZyB9KSA9PiBFWFRFTlNJT05TLmhhcyhleHRuYW1lKGZpbGUucGF0aCkpICYmICFmaWxlLnBhdGguaW5jbHVkZXMoJy5kLnRzJykpLm1hcCgoZjogeyBwYXRoOiBzdHJpbmcgfSkgPT4gZi5wYXRoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VycmVudFNoYSA9IEdJVEhVQl9TSEEhO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHR0cnkge1xuXHRcdFx0aW5mbyA9IGF3YWl0IG9jdG9raXQucmVwb3MuZ2V0Q29tbWl0KHsgb3duZXI6IGNvbnRleHQucmVwby5vd25lciwgcmVwbzogY29udGV4dC5yZXBvLnJlcG8sIHJlZjogR0lUSFVCX1NIQSEgfSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRjb25zb2xlLmxvZygnIyNbd2FybmluZ10gVG9rZW4gZG9lc25cXCd0IGhhdmUgcGVybWlzc2lvbiB0byBhY2Nlc3MgdGhpcyByZXNvdXJjZS4nKTtcblx0XHR9XG5cdFx0aWYgKGluZm8pIHtcblx0XHRcdGNvbnN0IGZpbGVzID0gaW5mby5kYXRhLmZpbGVzO1xuXHRcdFx0bGludEZpbGVzID0gZmlsZXMuZmlsdGVyKGZpbGUgPT4gRVhURU5TSU9OUy5oYXMoZXh0bmFtZShmaWxlLmZpbGVuYW1lKSkgJiYgIWZpbGUuZmlsZW5hbWUuaW5jbHVkZXMoJy5kLnRzJykgJiYgZmlsZS5zdGF0dXMgIT09ICdyZW1vdmVkJyAmJiBmaWxlLnN0YXR1cyAhPT0gJ2NoYW5nZWQnKS5tYXAoZiA9PiBmLmZpbGVuYW1lKTtcblx0XHR9XG5cdFx0Y3VycmVudFNoYSA9IEdJVEhVQl9TSEEhO1xuXHR9XG5cdGRlYnVnKGBDb21taXQ6ICR7Y3VycmVudFNoYX1gKTtcblxuXHRsZXQgaWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y29uc3Qgam9iTmFtZSA9IGdldElucHV0KCdqb2ItbmFtZScpO1xuXHRpZiAoam9iTmFtZSkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjaGVja3MgPSBhd2FpdCBvY3Rva2l0LmNoZWNrcy5saXN0Rm9yUmVmKHtcblx0XHRcdFx0Li4uY29udGV4dC5yZXBvLFxuXHRcdFx0XHRzdGF0dXM6ICdpbl9wcm9ncmVzcycsXG5cdFx0XHRcdHJlZjogY3VycmVudFNoYVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjaGVjayA9IGNoZWNrcy5kYXRhLmNoZWNrX3J1bnMuZmluZCgoeyBuYW1lIH0pID0+IG5hbWUudG9Mb3dlckNhc2UoKSA9PT0gam9iTmFtZS50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGlmIChjaGVjaykgaWQgPSBjaGVjay5pZDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGNvbnNvbGUubG9nKCcjI1t3YXJuaW5nXSBUb2tlbiBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGFjY2VzcyB0aGlzIHJlc291cmNlLicpO1xuXHRcdH1cblx0fVxuXHRpZiAoIWlkKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGlkID0gKGF3YWl0IG9jdG9raXQuY2hlY2tzLmNyZWF0ZSh7XG5cdFx0XHRcdC4uLmNvbnRleHQucmVwbyxcblx0XHRcdFx0bmFtZTogQUNUSU9OX05BTUUsXG5cdFx0XHRcdGhlYWRfc2hhOiBjdXJyZW50U2hhLFxuXHRcdFx0XHRzdGF0dXM6ICdpbl9wcm9ncmVzcycsXG5cdFx0XHRcdHN0YXJ0ZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuXHRcdFx0fSkpLmRhdGEuaWQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUubG9nKCcjI1t3YXJuaW5nXSBUb2tlbiBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGFjY2VzcyB0aGlzIHJlc291cmNlLicpO1xuXHRcdH1cblx0fVxuXG5cdHRyeSB7XG5cdFx0Y29uc3QgbGludEFsbCA9IGdldElucHV0KCdsaW50LWFsbCcpO1xuXHRcdGNvbnN0IHsgY29uY2x1c2lvbiwgb3V0cHV0IH0gPSBhd2FpdCBsaW50KGxpbnRBbGwgPyBudWxsIDogbGludEZpbGVzKTtcblx0XHRpZiAoaWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IG9jdG9raXQuY2hlY2tzLnVwZGF0ZSh7XG5cdFx0XHRcdFx0Li4uY29udGV4dC5yZXBvLFxuXHRcdFx0XHRcdGNoZWNrX3J1bl9pZDogaWQsXG5cdFx0XHRcdFx0Y29tcGxldGVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0Y29uY2x1c2lvbixcblx0XHRcdFx0XHRvdXRwdXRcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJyMjW3dhcm5pbmddIFRva2VuIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gYWNjZXNzIHRoaXMgcmVzb3VyY2UuJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGRlYnVnKG91dHB1dC5zdW1tYXJ5KTtcblx0XHRpZiAoY29uY2x1c2lvbiA9PT0gJ2ZhaWx1cmUnKSBzZXRGYWlsZWQob3V0cHV0LnN1bW1hcnkpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGlmIChpZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgb2N0b2tpdC5jaGVja3MudXBkYXRlKHtcblx0XHRcdFx0XHQuLi5jb250ZXh0LnJlcG8sXG5cdFx0XHRcdFx0Y2hlY2tfcnVuX2lkOiBpZCxcblx0XHRcdFx0XHRjb25jbHVzaW9uOiAnZmFpbHVyZScsXG5cdFx0XHRcdFx0Y29tcGxldGVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJyMjW3dhcm5pbmddIFRva2VuIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gYWNjZXNzIHRoaXMgcmVzb3VyY2UuJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNldEZhaWxlZChlcnJvci5tZXNzYWdlKTtcblx0fVxufVxuXG5ydW4oKTtcbiJdfQ==