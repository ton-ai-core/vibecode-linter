// CHANGE: Extracted history helper functions
// WHY: Reduces line count of history.ts to under 300
// REF: ESLint max-lines

import { extractDiffSnippet } from "../../core/diff/index.js";
import type { DiffSnippet } from "../../core/types/index.js";
import { execGitNonEmptyOrNull, getCommitSnippetForLine } from "./utils.js";

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
	// CHANGE: Avoid truthiness on possibly undefined string
	// WHY: strict-boolean-expressions — explicit undefined check
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	if (commitLine === undefined) return null;

	const hash = commitLine.slice("commit ".length).trim();
	const shortHash = hash.slice(0, 12);
	const dateLine = lines.find((row) => row.startsWith("Date:"));
	const date =
		typeof dateLine === "string" && dateLine.length > 0
			? (dateLine.slice("Date:".length).trim().split(" ")[0] ?? "unknown-date")
			: "unknown-date";
	const messageLine = lines.find((row) => row.startsWith("    "));
	const summaryRaw =
		typeof messageLine === "string" && messageLine.length > 0
			? messageLine.trim()
			: "(no subject)";
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
	readonly snippet: readonly string[] | undefined;
} | null> {
	const lines = segment.split(/\r?\n/u);
	const info = extractCommitBasicInfo(lines);
	// CHANGE: Avoid truthiness on nullable object
	// WHY: strict-boolean-expressions — explicit null check
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	if (info === null) return null;

	const snippet = await getCommitSnippetForLine(info.hash, filePath, line, 2);
	// CHANGE: Avoid truthiness on nullable array
	// WHY: strict-boolean-expressions — check null and length explicitly
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	const snippetLines =
		snippet !== null && snippet.length > 0 ? snippet : undefined;

	const resultLines: string[] = [];
	resultLines.push(
		`--- commit ${info.shortHash} (${info.date}) -------------------------`,
	);
	resultLines.push(`summary: ${info.summary}`);
	resultLines.push(`git show ${info.shortHash} -- ${relativePath} | cat`);

	if (snippetLines !== undefined) {
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
	// CHANGE: Avoid truthiness on possibly undefined string
	// WHY: strict-boolean-expressions — explicit nullish/empty handling
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	if (typeof authorLine === "string" && authorLine.length > 0) {
		return (
			authorLine.slice("Author:".length).trim().split("<")[0]?.trim() ??
			"unknown"
		);
	}
	return "unknown";
}

export function parseCommitInfo(segment: string): CommitInfo | null {
	const lines = segment.split(/\r?\n/u);
	// CHANGE: Reuse extractCommitBasicInfo to avoid duplicated parsing logic
	// WHY: Remove internal duplication (jscpd hit) while preserving invariants
	// REF: REQ-LINT-FIX
	const basic = extractCommitBasicInfo(lines);
	if (basic === null) return null;

	const author = extractAuthor(lines);
	return {
		hash: basic.hash,
		shortHash: basic.shortHash,
		date: basic.date,
		author,
		summary: basic.summary,
	};
}

export async function fetchCommitHistoryForLine(
	filePath: string,
	line: number,
	limit: number,
): Promise<CommitInfo[] | null> {
	const historyCommand = `git log -L ${line},${line}:${filePath} --date=short --pretty=format:"commit %H%nAuthor: %an <%ae>%nDate: %ad%n%n    %s%n"`;

	// CHANGE: Use execGitNonEmptyOrNull to centralize stdout extraction + non-empty invariant
	// WHY: remove duplicated pattern with trim/length checks (jscpd)
	// REF: REQ-LINT-FIX
	const out = await execGitNonEmptyOrNull(historyCommand, 5 * 1024 * 1024);
	if (out === null) {
		return null;
	}

	const segments = parseGitLogSegments(out);
	const commits: CommitInfo[] = [];
	for (const segment of segments.slice(0, limit + 1)) {
		const commitInfo = parseCommitInfo(segment);
		// CHANGE: Avoid truthiness on nullable object
		// WHY: strict-boolean-expressions — explicit null check
		// QUOTE(ТЗ): "Исправить все ошибки линтера"
		// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
		if (commitInfo !== null) commits.push(commitInfo);
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

	// CHANGE: Use execGitStdoutOrNull to centralize stdout extraction
	// WHY: remove duplicated try/catch across modules (jscpd)
	// REF: REQ-LINT-FIX
	const outDiff = await execGitNonEmptyOrNull(diffCommand, 10 * 1024 * 1024);
	if (outDiff !== null) {
		diffOutput = outDiff;
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
		// CHANGE: Avoid truthiness on possibly undefined entries
		// WHY: strict-boolean-expressions — handle undefined explicitly
		// QUOTE(ТЗ): "Исправить все ошибки линтера"
		// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
		if (newer === undefined || older === undefined) continue;

		const diffCommand = `git diff --unified=${contextLines} ${older.hash}..${newer.hash} -- "${fileInfo.path}"`;
		let diffOutput = "";

		// CHANGE: Use execGitStdoutOrNull to centralize stdout extraction
		// WHY: remove duplicated try/catch across modules (jscpd)
		// REF: REQ-LINT-FIX
		const out2 = await execGitNonEmptyOrNull(diffCommand, 10 * 1024 * 1024);
		if (out2 !== null) {
			diffOutput = out2;
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
