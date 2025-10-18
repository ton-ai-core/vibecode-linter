// CHANGE: Extracted git history functions from lint.ts
// WHY: Git history operations should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import * as path from "path";

import { extractDiffSnippet } from "../diff/index.js";
import type {
	DiffSnippet,
	ExecError,
	GitHistoryBlock,
} from "../types/index.js";
import { execGitCommand, getCommitSnippetForLine } from "./utils.js";

export interface CommitInfo {
	readonly hash: string;
	readonly shortHash: string;
	readonly date: string;
	readonly author: string;
	readonly summary: string;
}

export interface CommitDiffBlock {
	readonly heading: string;
	readonly newerCommit: CommitInfo;
	readonly olderCommit: CommitInfo;
	readonly diffSnippet: DiffSnippet | null;
}

/**
 * Получает историю изменений указанной строки файла.
 *
 * @param filePath Путь к файлу
 * @param line Номер строки (1-based)
 * @param limit Максимальное количество коммитов для отображения
 * @returns Блок истории изменений или null при ошибке
 */
export async function getGitHistoryBlock(
	filePath: string,
	line: number,
	limit: number,
): Promise<GitHistoryBlock | null> {
	const historyCommand = `git log -L ${line},${line}:${filePath} --date=short`;
	let historyOutput = "";

	try {
		const { stdout } = await execGitCommand(historyCommand, 5 * 1024 * 1024);
		historyOutput = stdout;
	} catch (error) {
		const execError = error as ExecError;
		if (execError.stdout) {
			historyOutput = execError.stdout;
		} else {
			return null;
		}
	}

	const trimmed = historyOutput.trim();
	if (trimmed.length === 0) {
		return null;
	}

	const segments: string[] = [];
	let currentSegment = "";
	const historyLines = trimmed.split(/\r?\n/u);
	const relativePath = path
		.relative(process.cwd(), filePath)
		.replace(/\\/g, "/");

	for (const row of historyLines) {
		if (row.startsWith("commit ") && currentSegment.length > 0) {
			segments.push(currentSegment.trimEnd());
			currentSegment = `${row}\n`;
		} else {
			currentSegment += `${row}\n`;
		}
	}
	if (currentSegment.trim().length > 0) {
		segments.push(currentSegment.trimEnd());
	}

	const header = "--- history (recent line updates) -------------------------";
	const result: string[] = [header];
	let taken = 0;
	let latestSnippet: ReadonlyArray<string> | undefined;

	for (const segment of segments) {
		if (taken >= limit) {
			break;
		}
		const lines = segment.split(/\r?\n/u);
		const commitLine = lines.find((row) => row.startsWith("commit "));
		if (!commitLine) {
			continue;
		}
		const hash = commitLine.slice("commit ".length).trim();
		const shortHash = hash.slice(0, 12);
		const dateLine = lines.find((row) => row.startsWith("Date:"));
		const date = dateLine
			? (dateLine.slice("Date:".length).trim().split(" ")[0] ?? "unknown-date")
			: "unknown-date";
		const messageLine = lines.find((row) => row.startsWith("    "));
		const summaryRaw = messageLine ? messageLine.trim() : "(no subject)";
		const summary =
			summaryRaw.length > 100 ? `${summaryRaw.slice(0, 97)}...` : summaryRaw;

		const snippet = await getCommitSnippetForLine(hash, filePath, line, 2);
		const snippetLines = snippet && snippet.length > 0 ? snippet : undefined;
		const heading = `--- commit ${shortHash} (${date}) -------------------------`;
		result.push(heading);
		result.push(`summary: ${summary}`);
		result.push(`git show ${shortHash} -- ${relativePath} | cat`);
		if (snippetLines) {
			for (const snippetLine of snippetLines) {
				result.push(snippetLine);
			}
			if (!latestSnippet) {
				latestSnippet = snippetLines;
			}
		} else {
			result.push(`(code for commit ${shortHash} is not available)`);
		}

		taken += 1;
	}

	const totalCommits = segments.length;
	if (result.length > 1) {
		result.push(`Total commits for line: ${totalCommits}`);
		result.push(`Full list: git log --follow -- ${relativePath} | cat`);
		return { lines: result, totalCommits, latestSnippet };
	}
	return null;
}

/**
 * Парсит информацию о коммите из git log output.
 *
 * @param segment Сегмент git log для одного коммита
 * @returns Информация о коммите или null
 */
function parseCommitInfo(segment: string): CommitInfo | null {
	const lines = segment.split(/\r?\n/u);
	const commitLine = lines.find((row) => row.startsWith("commit "));
	if (!commitLine) return null;

	const hash = commitLine.slice("commit ".length).trim();
	const shortHash = hash.slice(0, 12);

	const authorLine = lines.find((row) => row.startsWith("Author:"));
	const author = authorLine
		? (authorLine.slice("Author:".length).trim().split("<")[0]?.trim() ??
			"unknown")
		: "unknown";

	const dateLine = lines.find((row) => row.startsWith("Date:"));
	const date = dateLine
		? (dateLine.slice("Date:".length).trim().split(" ")[0] ?? "unknown-date")
		: "unknown-date";

	const messageLine = lines.find((row) => row.startsWith("    "));
	const summaryRaw = messageLine ? messageLine.trim() : "(no subject)";
	const summary =
		summaryRaw.length > 80 ? `${summaryRaw.slice(0, 77)}...` : summaryRaw;

	return { hash, shortHash, date, author, summary };
}

/**
 * Получает блоки diff между последовательными коммитами для указанной строки.
 *
 * @param filePath Путь к файлу
 * @param line Номер строки (1-based)
 * @param limit Максимальное количество diff блоков (пар коммитов)
 * @param contextLines Количество строк контекста в unified diff
 * @returns Массив блоков diff или null при ошибке
 */
export async function getCommitDiffBlocks(
	filePath: string,
	line: number,
	limit: number,
	contextLines = 3,
): Promise<ReadonlyArray<CommitDiffBlock> | null> {
	// CHANGE: Use git log without -L to get recent commits affecting the file
	// WHY: git log -L only shows commits that modified the exact line, may return too few commits
	// QUOTE(USER): "Мы отображаем последние 3 комита?"
	// REF: user-feedback-only-1-commit-shown
	// SOURCE: n/a
	const historyCommand = `git log -n ${limit + 1} --date=short --pretty=format:"commit %H%nAuthor: %an <%ae>%nDate: %ad%n%n    %s%n" -- "${filePath}"`;
	let historyOutput = "";

	try {
		const { stdout } = await execGitCommand(historyCommand, 5 * 1024 * 1024);
		historyOutput = stdout;
	} catch (error) {
		const execError = error as ExecError;
		if (execError.stdout) {
			historyOutput = execError.stdout;
		} else {
			return null;
		}
	}

	const trimmed = historyOutput.trim();
	if (trimmed.length === 0) return null;

	// Parse commits from git log output
	const segments: string[] = [];
	let currentSegment = "";
	const historyLines = trimmed.split(/\r?\n/u);

	for (const row of historyLines) {
		if (row.startsWith("commit ") && currentSegment.length > 0) {
			segments.push(currentSegment.trimEnd());
			currentSegment = `${row}\n`;
		} else {
			currentSegment += `${row}\n`;
		}
	}
	if (currentSegment.trim().length > 0) {
		segments.push(currentSegment.trimEnd());
	}

	const commits: CommitInfo[] = [];
	for (const segment of segments.slice(0, limit + 1)) {
		const commitInfo = parseCommitInfo(segment);
		if (commitInfo) commits.push(commitInfo);
	}

	if (commits.length < 2) return null;

	// Generate diff blocks for each pair of consecutive commits
	const diffBlocks: CommitDiffBlock[] = [];
	const relativePath = path
		.relative(process.cwd(), filePath)
		.replace(/\\/g, "/");

	for (let i = 0; i < Math.min(commits.length - 1, limit); i += 1) {
		const newer = commits[i];
		const older = commits[i + 1];
		if (!newer || !older) continue;

		const diffCommand = `git diff --unified=${contextLines} ${older.hash}..${newer.hash} -- "${filePath}"`;
		let diffOutput = "";

		try {
			const { stdout } = await execGitCommand(diffCommand, 10 * 1024 * 1024);
			diffOutput = stdout;
		} catch (error) {
			const execError = error as ExecError;
			if (execError.stdout) {
				diffOutput = execError.stdout;
			}
		}

		// Try to find snippet for target line, but if not found, use first hunk
		let diffSnippet: DiffSnippet | null = null;
		if (diffOutput.trim().length > 0) {
			diffSnippet = extractDiffSnippet(diffOutput, line);
			
			// If target line not in this commit, extract first hunk instead
			if (!diffSnippet) {
				// Find first @@ hunk
				const hunkMatch = diffOutput.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
				if (hunkMatch) {
					const firstChangedLine = Number.parseInt(hunkMatch[1] ?? "1", 10);
					diffSnippet = extractDiffSnippet(diffOutput, firstChangedLine);
				}
			}
		}

		const heading = `--- git diff ${older.shortHash}..${newer.shortHash} -- ${relativePath} | cat ---`;

		diffBlocks.push({
			heading,
			newerCommit: newer,
			olderCommit: older,
			diffSnippet,
		});
	}

	return diffBlocks.length > 0 ? diffBlocks : null;
}
