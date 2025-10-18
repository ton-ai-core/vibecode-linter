// CHANGE: Extracted history helper functions
// WHY: Reduces line count of history.ts to under 300
// REF: ESLint max-lines

import { extractDiffSnippet } from "../diff/index.js";
import type { DiffSnippet, ExecError } from "../types/index.js";
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

export function parseGitLogSegments(historyOutput: string): string[] {
	const segments: string[] = [];
	let currentSegment = "";
	const historyLines = historyOutput.split(/\r?\n/u);

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

	return segments;
}

function extractCommitBasicInfo(lines: readonly string[]): {
	hash: string;
	shortHash: string;
	date: string;
	summary: string;
} | null {
	const commitLine = lines.find((row) => row.startsWith("commit "));
	if (!commitLine) return null;

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

	return { hash, shortHash, date, summary };
}

export async function processCommitSegment(
	segment: string,
	filePath: string,
	line: number,
	relativePath: string,
): Promise<{
	readonly lines: string[];
	readonly snippet: ReadonlyArray<string> | undefined;
} | null> {
	const lines = segment.split(/\r?\n/u);
	const info = extractCommitBasicInfo(lines);
	if (!info) return null;

	const snippet = await getCommitSnippetForLine(info.hash, filePath, line, 2);
	const snippetLines = snippet && snippet.length > 0 ? snippet : undefined;

	const resultLines: string[] = [];
	resultLines.push(
		`--- commit ${info.shortHash} (${info.date}) -------------------------`,
	);
	resultLines.push(`summary: ${info.summary}`);
	resultLines.push(`git show ${info.shortHash} -- ${relativePath} | cat`);

	if (snippetLines) {
		for (const snippetLine of snippetLines) {
			resultLines.push(snippetLine);
		}
	} else {
		resultLines.push(`(code for commit ${info.shortHash} is not available)`);
	}

	return { lines: resultLines, snippet: snippetLines };
}

function extractAuthor(lines: readonly string[]): string {
	const authorLine = lines.find((row) => row.startsWith("Author:"));
	return authorLine
		? (authorLine.slice("Author:".length).trim().split("<")[0]?.trim() ??
				"unknown")
		: "unknown";
}

function extractDate(lines: readonly string[]): string {
	const dateLine = lines.find((row) => row.startsWith("Date:"));
	return dateLine
		? (dateLine.slice("Date:".length).trim().split(" ")[0] ?? "unknown-date")
		: "unknown-date";
}

function extractSummary(lines: readonly string[]): string {
	const messageLine = lines.find((row) => row.startsWith("    "));
	const summaryRaw = messageLine ? messageLine.trim() : "(no subject)";
	return summaryRaw.length > 80 ? `${summaryRaw.slice(0, 77)}...` : summaryRaw;
}

export function parseCommitInfo(segment: string): CommitInfo | null {
	const lines = segment.split(/\r?\n/u);
	const commitLine = lines.find((row) => row.startsWith("commit "));
	if (!commitLine) return null;

	const hash = commitLine.slice("commit ".length).trim();
	const shortHash = hash.slice(0, 12);
	const author = extractAuthor(lines);
	const date = extractDate(lines);
	const summary = extractSummary(lines);

	return { hash, shortHash, date, author, summary };
}

export async function fetchCommitHistoryForLine(
	filePath: string,
	line: number,
	limit: number,
): Promise<CommitInfo[] | null> {
	const historyCommand = `git log -L ${line},${line}:${filePath} --date=short --pretty=format:"commit %H%nAuthor: %an <%ae>%nDate: %ad%n%n    %s%n"`;
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

	const segments = parseGitLogSegments(trimmed);
	const commits: CommitInfo[] = [];
	for (const segment of segments.slice(0, limit + 1)) {
		const commitInfo = parseCommitInfo(segment);
		if (commitInfo) commits.push(commitInfo);
	}

	return commits;
}

export async function handleSingleCommit(
	creation: CommitInfo,
	filePath: string,
	line: number,
	relativePath: string,
	contextLines: number,
): Promise<CommitDiffBlock[]> {
	const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
	const diffCommand = `git diff --unified=${contextLines} ${emptyTree}..${creation.hash} -- "${filePath}"`;
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

	const diffSnippet =
		diffOutput.trim().length > 0 ? extractDiffSnippet(diffOutput, line) : null;

	const heading = `--- git diff ${emptyTree.slice(0, 12)}..${creation.shortHash} -- ${relativePath} | cat`;

	return [
		{
			heading,
			newerCommit: creation,
			olderCommit: {
				hash: emptyTree,
				shortHash: "(initial)",
				date: creation.date,
				author: creation.author,
				summary: "File did not exist",
			},
			diffSnippet,
		},
	];
}

export async function buildDiffBlocks(
	commits: CommitInfo[],
	fileInfo: { path: string; relativePath: string; line: number },
	limit: number,
	contextLines: number,
): Promise<CommitDiffBlock[]> {
	const diffBlocks: CommitDiffBlock[] = [];

	for (let i = 0; i < Math.min(commits.length - 1, limit); i += 1) {
		const newer = commits[i];
		const older = commits[i + 1];
		if (!newer || !older) continue;

		const diffCommand = `git diff --unified=${contextLines} ${older.hash}..${newer.hash} -- "${fileInfo.path}"`;
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

		const diffSnippet =
			diffOutput.trim().length > 0
				? extractDiffSnippet(diffOutput, fileInfo.line)
				: null;

		const heading = `--- git diff ${older.shortHash}..${newer.shortHash} -- ${fileInfo.relativePath} | cat`;

		diffBlocks.push({
			heading,
			newerCommit: newer,
			olderCommit: older,
			diffSnippet,
		});
	}

	return diffBlocks;
}
