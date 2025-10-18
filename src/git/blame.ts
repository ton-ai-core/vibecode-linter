// CHANGE: Extracted git blame functions from lint.ts
// WHY: Git blame operations should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import * as path from "path";

import type {
	ExecError,
	GitBlameOptions,
	GitBlameResult,
} from "../types/index.js";
import { execGitCommand } from "./utils.js";

/**
 * Получает информацию git blame для указанной строки файла.
 *
 * @param filePath Путь к файлу
 * @param line Номер строки (1-based)
 * @param options Опции для отображения дополнительной информации
 * @returns Результат git blame или null при ошибке
 */
export async function getGitBlameBlock(
	filePath: string,
	line: number,
	options?: GitBlameOptions,
): Promise<GitBlameResult | null> {
	const contextSize = 2;
	const startLine = Math.max(1, line - contextSize);
	const endLine = line + contextSize;
	const blameCommand = `git blame --line-porcelain -L ${startLine},${endLine} -- "${filePath}"`;
	let blameOutput = "";

	try {
		const { stdout } = await execGitCommand(blameCommand, 2 * 1024 * 1024);
		blameOutput = stdout;
	} catch (error) {
		const execError = error as ExecError;
		if (execError.stdout) {
			blameOutput = execError.stdout;
		} else {
			return null;
		}
	}

	const trimmed = blameOutput.trim();
	if (trimmed.length === 0) {
		return null;
	}

	const rows = trimmed.split(/\r?\n/u);
	const headerTokens = rows[0]?.split(" ") ?? [];
	const commitHash = headerTokens[0] ?? "";
	const authorLine = rows.find((row) => row.startsWith("author "));
	const author = authorLine
		? authorLine.slice("author ".length).trim()
		: "unknown";
	const authorTimeLine = rows.find((row) => row.startsWith("author-time "));
	const authorEpoch = authorTimeLine
		? Number.parseInt(authorTimeLine.slice("author-time ".length), 10)
		: Number.NaN;
	const summaryLine = rows.find((row) => row.startsWith("summary "));
	const summary = summaryLine
		? summaryLine.slice("summary ".length).trim()
		: "(no summary)";
	const sourceLine = rows.find((row) => row.startsWith("\t"));
	const codeText = sourceLine ? sourceLine.slice(1) : "";

	const dateString = Number.isFinite(authorEpoch)
		? new Date(authorEpoch * 1000).toISOString().slice(0, 10)
		: "unknown-date";

	const shortHash = commitHash.slice(0, 12);
	const isZeroHash = /^0+$/.test(commitHash);

	const baseHeading = `--- git blame (line ${line}) ------------------------------------`;
	const relativePath = path
		.relative(process.cwd(), filePath)
		.replace(/\\/g, "/");

	if (isZeroHash) {
		const before = Math.max(1, line - contextSize);
		const after = line + contextSize;
		return {
			lines: [
				baseHeading,
				`Command: git blame -L ${before},${after} -- ${relativePath} | cat`,
			],
			commitHash: null,
			shortHash: null,
		};
	}

	const lines: string[] = [
		baseHeading,
		`commit ${shortHash} (${dateString})  Author: ${author}`,
	];
	lines.push(`summary: ${summary}`);
	lines.push(`${line}) ${codeText}`);

	if (typeof options?.historyCount === "number") {
		lines.push(`Total commits for line: ${options.historyCount}`);
	}

	lines.push(`Commands: git blame -L ${line},${line} -- ${relativePath} | cat`);

	if (options?.fallbackSnippet && options.fallbackSnippet.length > 0) {
		lines.push("Code context:");
		for (const snippetLine of options.fallbackSnippet) {
			lines.push(snippetLine);
		}
	}

	return {
		lines,
		commitHash,
		shortHash,
	};
}
