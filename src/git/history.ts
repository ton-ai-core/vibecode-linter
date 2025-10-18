// CHANGE: Extracted git history functions from lint.ts
// WHY: Git history operations should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import * as path from "path";

import type { ExecError, GitHistoryBlock } from "../types/index.js";
import { execGitCommand, getCommitSnippetForLine } from "./utils.js";

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
