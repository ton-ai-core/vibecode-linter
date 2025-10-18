// CHANGE: Extracted git diff functions from lint.ts
// WHY: Git diff operations should be in a separate module for better organization
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import {
	computeRealColumnFromVisual,
	expandTabs,
	pickSnippetForLine,
	TAB_WIDTH,
	visualColumnAt,
} from "../diff/index.js";
import type {
	DiffLineView,
	DiffRangeConfig,
	DiffSnippet,
	ExecError,
	GitDiffBlock,
	LintMessage,
} from "../types/index.js";
import { execGitCommand } from "./utils.js";

/**
 * Уточняет диапазон подсветки на основе текста сообщения об ошибке.
 *
 * @param content Содержимое строки
 * @param start Начальная позиция
 * @param end Конечная позиция
 * @param message Сообщение об ошибке (может содержать идентификатор в кавычках)
 * @returns Уточненный диапазон подсветки
 */
function refineHighlightRange(
	content: string,
	start: number,
	end: number,
	message: LintMessage,
): { start: number; end: number } {
	const text = message.message;
	const identMatch = text.match(/["']([A-Za-z0-9_$]+)["']/);
	const identifier = identMatch?.[1];
	if (identifier) {
		const foundIdx = content.indexOf(identifier);
		if (foundIdx !== -1) {
			return { start: foundIdx, end: foundIdx + identifier.length };
		}
	}
	return { start, end };
}

// CHANGE: Extracted helper to create diff attempts config
// WHY: Reduces line count of getGitDiffBlock
// QUOTE(LINT): "Function has too many lines (190). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function createDiffAttempts(
	message: LintMessage & { filePath: string },
	rangeConfig: DiffRangeConfig,
	contextLines: number,
): ReadonlyArray<{ readonly descriptor: string; readonly command: string }> {
	return [
		{
			descriptor: rangeConfig.label,
			command: `git diff --unified=${contextLines} ${rangeConfig.diffArg} -- "${message.filePath}"`,
		},
		{
			descriptor: "workspace",
			command: `git diff --unified=${contextLines} -- "${message.filePath}"`,
		},
		{
			descriptor: "index",
			command: `git diff --cached --unified=${contextLines} -- "${message.filePath}"`,
		},
	];
}

// CHANGE: Extracted helper to execute diff attempts
// WHY: Reduces complexity and line count of getGitDiffBlock
// QUOTE(LINT): "Function has too many lines (190). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
async function executeDiffAttempts(
	attempts: ReadonlyArray<{
		readonly descriptor: string;
		readonly command: string;
	}>,
	targetLine: number,
): Promise<{
	readonly snippet: DiffSnippet;
	readonly descriptor: string;
} | null> {
	const diffOutputs: string[] = [];
	const descriptors: string[] = [];

	for (const attempt of attempts) {
		let diffOutput = "";
		try {
			const { stdout } = await execGitCommand(attempt.command);
			diffOutput = stdout;
		} catch (error) {
			const execError = error as ExecError;
			if (execError.stdout) {
				diffOutput = execError.stdout;
			} else {
				continue;
			}
		}

		if (diffOutput.trim().length === 0) {
			continue;
		}

		diffOutputs.push(diffOutput);
		descriptors.push(attempt.descriptor);

		const pickResult = pickSnippetForLine(diffOutputs, targetLine);
		if (pickResult) {
			const descriptorIndex = pickResult.index;
			const descriptor = descriptors[descriptorIndex] ?? attempt.descriptor;
			return {
				snippet: pickResult.snippet,
				descriptor,
			};
		}
	}

	return null;
}

// CHANGE: Extracted helper to compute column positions
// WHY: Reduces line count of getGitDiffBlock
// QUOTE(LINT): "Function has too many lines (190). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function computeColumnPositions(
	message: LintMessage & { filePath: string },
	pointerLine: DiffLineView,
): { readonly startColumn: number; readonly endColumn: number } {
	const visualStart = Math.max(0, message.column - 1);
	const startColumn = computeRealColumnFromVisual(
		pointerLine.content,
		visualStart,
	);

	let endVisual = visualStart + 1;
	if (
		"endColumn" in message &&
		typeof message.endColumn === "number" &&
		Number.isFinite(message.endColumn)
	) {
		endVisual = Math.max(visualStart + 1, message.endColumn - 1);
	}
	const endColumn = computeRealColumnFromVisual(pointerLine.content, endVisual);

	return { startColumn, endColumn };
}

// CHANGE: Extracted helper to clamp and refine range
// WHY: Reduces line count of getGitDiffBlock
// QUOTE(LINT): "Function has too many lines (190). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function clampAndRefineRange(
	startColumn: number,
	endColumn: number,
	pointerLine: DiffLineView,
	message: LintMessage,
): { readonly rangeStart: number; readonly rangeEnd: number } {
	const clampedStart = Math.min(startColumn, pointerLine.content.length);
	const clampedEnd = Math.max(
		clampedStart + 1,
		Math.min(pointerLine.content.length, endColumn),
	);

	const refinedRange = refineHighlightRange(
		pointerLine.content,
		clampedStart,
		clampedEnd,
		message,
	);

	const rangeStart = Math.max(
		0,
		Math.min(refinedRange.start, pointerLine.content.length),
	);
	const rangeEnd = Math.max(
		rangeStart + 1,
		Math.min(pointerLine.content.length, refinedRange.end),
	);

	return { rangeStart, rangeEnd };
}

// CHANGE: Extracted helper to format diff lines
// WHY: Reduces line count of getGitDiffBlock
// QUOTE(LINT): "Function has too many lines (190). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function formatDiffLines(
	snippet: DiffSnippet,
	pointerIndex: number,
): { readonly lines: string[]; readonly headLineNumbers: Set<number> } {
	const headLineNumbers = new Set<number>();
	const formattedLines: string[] = [];

	const contextBefore = 2;
	const contextAfter = 2;
	const start = Math.max(0, pointerIndex - contextBefore);
	const end = Math.min(snippet.lines.length, pointerIndex + contextAfter + 1);

	// Add ellipsis if lines were skipped at the beginning
	if (start > 0) {
		formattedLines.push("       ... (earlier lines omitted)");
	}

	// Format only the relevant lines around the error
	for (let i = start; i < end; i += 1) {
		const line = snippet.lines[i];
		if (!line) continue;

		const lineNumber =
			line.headLineNumber !== null
				? String(line.headLineNumber).padStart(4)
				: "    ";
		const symbol = line.symbol ?? " ";
		if (line.headLineNumber !== null) {
			headLineNumbers.add(line.headLineNumber);
		}
		formattedLines.push(
			`${symbol} ${lineNumber} | ${expandTabs(line.content, TAB_WIDTH)}`,
		);
	}

	// Add ellipsis if lines were skipped at the end
	if (end < snippet.lines.length) {
		formattedLines.push("       ... (later lines omitted)");
	}

	return { lines: formattedLines, headLineNumbers };
}

// CHANGE: Extracted helper to create caret line
// WHY: Reduces line count of getGitDiffBlock
// QUOTE(LINT): "Function has too many lines (190). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function createCaretLine(
	pointerLine: DiffLineView,
	rangeStart: number,
	rangeEnd: number,
): string {
	const pointerLabel = "    ";
	const pointerExpanded = expandTabs(pointerLine.content, TAB_WIDTH);
	const visualStartColumn = Math.max(
		0,
		visualColumnAt(pointerLine.content, rangeStart, TAB_WIDTH),
	);
	const visualEndColumn = Math.max(
		visualStartColumn + 1,
		visualColumnAt(pointerLine.content, rangeEnd, TAB_WIDTH),
	);
	const cappedEnd = Math.min(pointerExpanded.length, visualEndColumn);
	const caretBase = `${" ".repeat(Math.min(visualStartColumn, pointerExpanded.length))}${"^".repeat(Math.max(1, cappedEnd - visualStartColumn))}`;
	const caretOverlay = caretBase.padEnd(pointerExpanded.length, " ");
	const caretLinePrefixLength = 1 + 1 + pointerLabel.length + 1 + 1 + 1; // symbol, space, label, space, '|', space
	return `${" ".repeat(caretLinePrefixLength)}${caretOverlay}`;
}

// CHANGE: Extracted context type for buildFinalDiffBlock
// WHY: Reduces parameter count from 6 to 2 to satisfy max-params rule
// QUOTE(LINT): "Function has too many parameters (6). Maximum allowed is 5"
// REF: ESLint max-params
// SOURCE: n/a
interface DiffBlockContext {
	readonly snippet: DiffSnippet;
	readonly descriptor: string;
	readonly pointerIndex: number;
	readonly pointerLine: DiffLineView;
	readonly message: LintMessage & { filePath: string };
	readonly normalizedContext: number;
}

// CHANGE: Extracted helper to build final diff block with context object
// WHY: Reduces parameter count to satisfy max-params rule
// QUOTE(LINT): "Function has too many parameters (6). Maximum allowed is 5"
// REF: ESLint max-params
// SOURCE: n/a
function buildFinalDiffBlock(context: DiffBlockContext): GitDiffBlock {
	const columns = computeColumnPositions(context.message, context.pointerLine);
	const highlightRange = clampAndRefineRange(
		columns.startColumn,
		columns.endColumn,
		context.pointerLine,
		context.message,
	);

	const { lines: formattedLines, headLineNumbers } = formatDiffLines(
		context.snippet,
		context.pointerIndex,
	);

	const caretLine = createCaretLine(
		context.pointerLine,
		highlightRange.rangeStart,
		highlightRange.rangeEnd,
	);

	// Adjust insertion index: pointerIndex is in full snippet, but formattedLines is truncated
	const contextBefore = 2;
	const start = Math.max(0, context.pointerIndex - contextBefore);
	const adjustedPointerIndex =
		context.pointerIndex - start + (start > 0 ? 1 : 0);
	formattedLines.splice(adjustedPointerIndex + 1, 0, caretLine);

	return {
		heading: `--- git diff (${context.descriptor}, U=${context.normalizedContext}) -------------------------`,
		lines: [context.snippet.header, ...formattedLines],
		footer: "   |-----------------------------------------------------------",
		headLineNumbers,
	};
}

/**
 * Получает блок git diff для сообщения об ошибке с подсветкой проблемного места.
 *
 * CHANGE: Refactored to reduce complexity and line count using helper functions
 * WHY: Original function had 190 lines and complexity 22
 * QUOTE(LINT): "Function has too many lines/complexity"
 * REF: ESLint max-lines-per-function, complexity
 * SOURCE: n/a
 *
 * @param message Сообщение об ошибке с информацией о файле и строке
 * @param rangeConfig Конфигурация диапазона для git diff
 * @param contextLines Количество строк контекста вокруг изменения
 * @returns Блок git diff с форматированием или null, если diff недоступен
 */
export async function getGitDiffBlock(
	message: LintMessage & { filePath: string },
	rangeConfig: DiffRangeConfig,
	contextLines: number,
): Promise<GitDiffBlock | null> {
	const normalizedContext = contextLines > 0 ? contextLines : 3;

	const attempts = createDiffAttempts(message, rangeConfig, normalizedContext);
	const selection = await executeDiffAttempts(attempts, message.line);

	if (!selection) {
		return null;
	}

	const { snippet, descriptor } = selection;
	const pointerIndex = snippet.pointerIndex;
	if (pointerIndex === null) {
		return null;
	}

	const pointerLine = snippet.lines[pointerIndex];
	if (!pointerLine) {
		return null;
	}

	return buildFinalDiffBlock({
		snippet,
		descriptor,
		pointerIndex,
		pointerLine,
		message,
		normalizedContext,
	});
}
