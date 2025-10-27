import * as path from "node:path";

import type { GitHistoryBlock } from "../../core/types/index.js";
import {
	buildDiffBlocks,
	type CommitDiffBlock,
	type CommitInfo,
	fetchCommitHistoryForLine,
	handleSingleCommit,
	parseGitLogSegments,
	processCommitSegment,
} from "./history-helpers.js";
import { execGitNonEmptyOrNull } from "./utils.js";

export type { CommitInfo, CommitDiffBlock };

// CHANGE: Helper to reduce complexity by picking first defined value
// WHY: Replace conditional update of latestSnippet with a pure helper
// REF: REQ-LINT-FIX, exactOptionalPropertyTypes
function pickFirst<T>(a: T | undefined, b: T | undefined): T | undefined {
	return a === undefined ? b : a;
}

async function buildHistoryResult(
	segments: string[],
	filePath: string,
	line: number,
	relativePath: string,
	limit: number,
): Promise<GitHistoryBlock | null> {
	const header = "--- history (recent line updates) -------------------------";
	const result: string[] = [header];
	let latestSnippet: readonly string[] | undefined;

	// CHANGE: Bound iteration upfront to avoid loop guard inside (reduces complexity)
	// WHY: ESLint complexity threshold
	const limited = segments.slice(0, limit);

	for (const segment of limited) {
		const processed = await processCommitSegment(
			segment,
			filePath,
			line,
			relativePath,
		);
		if (processed === null) continue;

		for (const l of processed.lines) {
			result.push(l);
		}
		// CHANGE: Use helper to avoid conditional update
		latestSnippet = pickFirst(latestSnippet, processed.snippet);
	}

	const totalCommits = segments.length;
	if (result.length > 1) {
		result.push(`Total commits for line: ${totalCommits}`);
		result.push(`Full list: git log --follow -- ${relativePath} | cat`);
		return latestSnippet === undefined
			? { lines: result, totalCommits }
			: { lines: result, totalCommits, latestSnippet };
	}
	return null;
}

export async function getGitHistoryBlock(
	filePath: string,
	line: number,
	limit: number,
): Promise<GitHistoryBlock | null> {
	const historyCommand = `git log -L ${line},${line}:${filePath} --date=short`;
	let historyOutput = "";

	const out = await execGitNonEmptyOrNull(historyCommand, 5 * 1024 * 1024);
	if (out === null) {
		return null;
	}
	historyOutput = out;

	const segments = parseGitLogSegments(historyOutput);
	const relativePath = path
		.relative(process.cwd(), filePath)
		.replace(/\\/g, "/");

	return buildHistoryResult(segments, filePath, line, relativePath, limit);
}

/**
 * Получает блоки diff между последовательными коммитами для указанной строки.
 *
 * CHANGE: Refactored to reduce line count using helper functions
 * WHY: Original function had 111 lines
 * QUOTE(LINT): "Function has too many lines (111). Maximum allowed is 50"
 * REF: ESLint max-lines-per-function
 * SOURCE: n/a
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
): Promise<readonly CommitDiffBlock[] | null> {
	const commits = await fetchCommitHistoryForLine(filePath, line, limit);
	// CHANGE: Avoid truthiness on nullable array
	// WHY: strict-boolean-expressions — explicit null check
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	if (commits === null) return null;

	const relativePath = path
		.relative(process.cwd(), filePath)
		.replace(/\\/g, "/");

	if (commits.length < 2) {
		if (commits.length === 1) {
			const creation = commits[0];
			// CHANGE: Avoid truthiness on possibly undefined element
			// WHY: strict-boolean-expressions — explicit undefined check
			// QUOTE(ТЗ): "Исправить все ошибки линтера"
			// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
			if (creation === undefined) return null;
			return handleSingleCommit(
				creation,
				filePath,
				line,
				relativePath,
				contextLines,
			);
		}
		return null;
	}

	const diffBlocks = await buildDiffBlocks(
		commits,
		{ path: filePath, relativePath, line },
		limit,
		contextLines,
	);

	return diffBlocks.length > 0 ? diffBlocks : null;
}
