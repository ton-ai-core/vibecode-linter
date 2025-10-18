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

/**
 * Получает блок git diff для сообщения об ошибке с подсветкой проблемного места.
 *
 * @param message Сообщение об ошибке с информацией о файле и строке
 * @param range Конфигурация диапазона для git diff
 * @param contextLines Количество строк контекста вокруг изменения
 * @returns Блок git diff с форматированием или null, если diff недоступен
 */
export async function getGitDiffBlock(
	message: LintMessage & { filePath: string },
	range: DiffRangeConfig,
	contextLines: number,
): Promise<GitDiffBlock | null> {
	const normalizedContext = contextLines > 0 ? contextLines : 3;

	// CHANGE: Added fallback git diff commands for workspace and index
	// WHY: Errors may come from uncommitted changes that are not present in upstream...HEAD diff
	// QUOTE(SPEC): "Ensure git diff shows local modifications as well"
	// REF: REQ-20250210-LINT-DIFF
	// SOURCE: n/a
	const attempts: Array<{
		readonly descriptor: string;
		readonly command: string;
	}> = [
		{
			descriptor: range.label,
			command: `git diff --unified=${normalizedContext} ${range.diffArg} -- "${message.filePath}"`,
		},
		{
			descriptor: "workspace",
			command: `git diff --unified=${normalizedContext} -- "${message.filePath}"`,
		},
		{
			descriptor: "index",
			command: `git diff --cached --unified=${normalizedContext} -- "${message.filePath}"`,
		},
	];

	const diffOutputs: string[] = [];
	const descriptors: string[] = [];
	let selection: { snippet: DiffSnippet; descriptor: string } | null = null;

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

		const pickResult = pickSnippetForLine(diffOutputs, message.line);
		if (pickResult) {
			const descriptorIndex = pickResult.index;
			const descriptor = descriptors[descriptorIndex] ?? attempt.descriptor;
			selection = {
				snippet: pickResult.snippet,
				descriptor,
			};
			break;
		}
	}

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

	// CHANGE: Limit diff output to 2-3 lines before/after error
	// WHY: User wants compact diff output (max 5-7 lines), not entire hunk
	// QUOTE(USER): "У нас диф должен быть максимум 5 строчек. А не целый километр"
	// REF: user-request-compact-diff
	// SOURCE: n/a
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

	// CHANGE: Adjust caret insertion index for truncated output
	// WHY: pointerIndex is relative to full snippet, but we now show truncated range
	// REF: user-request-compact-diff
	// SOURCE: n/a
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
	const caretLine = `${" ".repeat(caretLinePrefixLength)}${caretOverlay}`;

	// Adjust insertion index: pointerIndex is in full snippet, but formattedLines is truncated
	const adjustedPointerIndex = pointerIndex - start + (start > 0 ? 1 : 0); // +1 for ellipsis line if present
	formattedLines.splice(adjustedPointerIndex + 1, 0, caretLine);

	return {
		heading: `--- git diff (${descriptor}, U=${normalizedContext}) -------------------------`,
		lines: [snippet.header, ...formattedLines],
		footer: "   |-----------------------------------------------------------",
		headLineNumbers,
	};
}
