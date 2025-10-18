// CHANGE: Extracted git blame functions from lint.ts
// WHY: Git blame operations should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import * as path from "node:path";

import type {
	ExecError,
	GitBlameOptions,
	GitBlameResult,
} from "../types/index.js";
import { execGitCommand } from "./utils.js";

// CHANGE: Extracted helper to execute git blame command
// WHY: Reduces complexity of getGitBlameBlock
// QUOTE(LINT): "Function has a complexity of 14. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
async function executeBlameCommand(
	filePath: string,
	startLine: number,
	endLine: number,
): Promise<string | null> {
	const blameCommand = `git blame --line-porcelain -L ${startLine},${endLine} -- "${filePath}"`;

	try {
		const { stdout } = await execGitCommand(blameCommand, 2 * 1024 * 1024);
		return stdout;
	} catch (error) {
		const execError = error as ExecError;
		return execError.stdout || null;
	}
}

// CHANGE: Extracted helper to parse blame output
// WHY: Reduces complexity and line count of getGitBlameBlock
// QUOTE(LINT): "Function has too many lines (85). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
interface BlameInfo {
	readonly commitHash: string;
	readonly author: string;
	readonly authorEpoch: number;
	readonly summary: string;
}

function parseBlameOutput(output: string): BlameInfo | null {
	const trimmed = output.trim();
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

	return { commitHash, author, authorEpoch, summary };
}

// CHANGE: Extracted helper to format blame result
// WHY: Reduces line count of getGitBlameBlock
// QUOTE(LINT): "Function has too many lines (85). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function formatBlameResult(
	info: BlameInfo,
	line: number,
	filePath: string,
	contextSize: number,
	options?: GitBlameOptions,
): GitBlameResult {
	const dateString = Number.isFinite(info.authorEpoch)
		? new Date(info.authorEpoch * 1000).toISOString().slice(0, 10)
		: "unknown-date";

	const shortHash = info.commitHash.slice(0, 12);
	const isZeroHash = /^0+$/.test(info.commitHash);

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
		`commit ${shortHash} (${dateString})  Author: ${info.author}`,
		`summary: ${info.summary}`,
	];

	if (typeof options?.historyCount === "number") {
		lines.push(`Total commits for line: ${options.historyCount}`);
	}

	return {
		lines,
		commitHash: info.commitHash,
		shortHash,
	};
}

/**
 * Получает информацию git blame для указанной строки файла.
 *
 * CHANGE: Refactored to reduce complexity and line count
 * WHY: Original function had 85 lines and complexity 14
 * QUOTE(LINT): "Function has too many lines/complexity"
 * REF: ESLint max-lines-per-function, complexity
 * SOURCE: n/a
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

	const blameOutput = await executeBlameCommand(filePath, startLine, endLine);
	if (!blameOutput) {
		return null;
	}

	const info = parseBlameOutput(blameOutput);
	if (!info) {
		return null;
	}

	return formatBlameResult(info, line, filePath, contextSize, options);
}
