import * as path from "node:path";

import type { ExecError, GitHistoryBlock } from "../types/index.js";
import {
	buildDiffBlocks,
	type CommitDiffBlock,
	type CommitInfo,
	fetchCommitHistoryForLine,
	handleSingleCommit,
	parseGitLogSegments,
	processCommitSegment,
} from "./history-helpers.js";
import { execGitCommand } from "./utils.js";

export type { CommitInfo, CommitDiffBlock };

async function buildHistoryResult(
	segments: string[],
	filePath: string,
	line: number,
	relativePath: string,
	limit: number,
): Promise<GitHistoryBlock | null> {
	const header = "--- history (recent line updates) -------------------------";
	const result: string[] = [header];
	let taken = 0;
	let latestSnippet: ReadonlyArray<string> | undefined;

	for (const segment of segments) {
		if (taken >= limit) {
			break;
		}

		const processed = await processCommitSegment(
			segment,
			filePath,
			line,
			relativePath,
		);
		if (!processed) {
			continue;
		}

		for (const line of processed.lines) {
			result.push(line);
		}

		if (!latestSnippet && processed.snippet) {
			latestSnippet = processed.snippet;
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

	const segments = parseGitLogSegments(trimmed);
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
): Promise<ReadonlyArray<CommitDiffBlock> | null> {
	const commits = await fetchCommitHistoryForLine(filePath, line, limit);
	if (!commits) return null;

	const relativePath = path
		.relative(process.cwd(), filePath)
		.replace(/\\/g, "/");

	if (commits.length < 2) {
		if (commits.length === 1) {
			const creation = commits[0];
			if (!creation) return null;
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
