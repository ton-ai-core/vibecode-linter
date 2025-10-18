// CHANGE: Extracted diff parsing functions from lint.ts
// WHY: Diff parsing logic should be in a separate module for better testability
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import type { DiffLineView, DiffSnippet } from "../types/index.js";

const UNIFIED_HEADER_PATTERN = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// CHANGE: Extracted helper to parse diff header
// WHY: Reduces complexity of extractDiffSnippet
// QUOTE(LINT): "Function has a complexity of 14. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function parseDiffHeader(line: string): number {
	const match = UNIFIED_HEADER_PATTERN.exec(line);
	return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

// CHANGE: Extracted helper to process diff line
// WHY: Reduces complexity and line count of extractDiffSnippet
// QUOTE(LINT): "Function has too many lines (77). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function processDiffLine(
	line: string,
	headLine: number,
	targetLine: number,
	currentLines: DiffLineView[],
): { readonly newHeadLine: number; readonly foundTarget: boolean } {
	const symbol = line.length > 0 ? line[0] : undefined;
	let headLineNumber: number | null = null;
	let newHeadLine = headLine;

	if (symbol === "+" || symbol === " ") {
		headLineNumber = headLine;
		newHeadLine = headLine + 1;
	}

	const content = symbol ? line.slice(1) : line;
	currentLines.push({
		raw: line,
		symbol: symbol as DiffLineView["symbol"],
		headLineNumber,
		content,
	});

	const foundTarget = headLineNumber === targetLine;
	return { newHeadLine, foundTarget };
}

// CHANGE: Extracted snippet state type
// WHY: Improves code organization and reduces parameter count
// QUOTE(LINT): "Function has too many lines (77). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
interface SnippetState {
	currentHeader: string;
	currentLines: DiffLineView[];
	currentPointer: number | null;
	headLine: number;
}

// CHANGE: Extracted helper to create snippet if complete
// WHY: Reduces complexity of extractDiffSnippet
// QUOTE(LINT): "Function has a complexity of 14. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function flushSnippet(state: SnippetState): DiffSnippet | null {
	if (state.currentHeader && state.currentPointer !== null) {
		return {
			header: state.currentHeader,
			lines: state.currentLines,
			pointerIndex: state.currentPointer,
		};
	}
	return null;
}

/**
 * Извлекает из unified diff тот фрагмент, который содержит указанную строку из HEAD.
 *
 * CHANGE: Refactored to reduce complexity and line count
 * WHY: Original function had 77 lines and complexity 14
 * QUOTE(LINT): "Function has too many lines/complexity"
 * REF: ESLint max-lines-per-function, complexity
 * SOURCE: n/a
 *
 * @param unifiedDiff Полный unified diff в текстовом виде
 * @param targetLine Целевая линия в HEAD (1-based)
 * @returns Фрагмент diff или null, если строка не менялась
 *
 * @invariant targetLine > 0
 *
 * @example
 * ```ts
 * const diff = `@@ -1,3 +1,3 @@
 *  line1
 * -line2
 * +line2 modified
 *  line3`;
 * const snippet = extractDiffSnippet(diff, 2);
 * // Returns snippet with pointerIndex pointing to "line2 modified"
 * ```
 */
export function extractDiffSnippet(
	unifiedDiff: string,
	targetLine: number,
): DiffSnippet | null {
	// CHANGE: Precondition check for targetLine
	// WHY: Ensures we only work with valid line numbers (1-based)
	// QUOTE(SPEC): "targetLine must be positive"
	// REF: REQ-20250210-MODULAR-ARCH
	// SOURCE: n/a
	if (targetLine <= 0) {
		throw new Error(`targetLine must be positive, received ${targetLine}`);
	}

	const lines = unifiedDiff.split(/\r?\n/u);
	const state: SnippetState = {
		currentHeader: "",
		currentLines: [],
		currentPointer: null,
		headLine: 0,
	};

	for (const line of lines) {
		if (line.startsWith("@@")) {
			const maybeSnippet = flushSnippet(state);
			if (maybeSnippet) {
				return maybeSnippet;
			}

			state.currentHeader = line;
			state.currentLines = [];
			state.currentPointer = null;
			state.headLine = parseDiffHeader(line);
			continue;
		}

		if (!state.currentHeader) {
			continue;
		}

		const result = processDiffLine(
			line,
			state.headLine,
			targetLine,
			state.currentLines,
		);
		state.headLine = result.newHeadLine;
		if (result.foundTarget) {
			state.currentPointer = state.currentLines.length - 1;
		}
	}

	return flushSnippet(state);
}

/**
 * Находит первый фрагмент diff из списка кандидатов, содержащий указанную строку HEAD.
 *
 * @param candidates Список текстов unified diff
 * @param targetLine Номер строки в HEAD (1-based)
 * @returns Пара { snippet, index } либо null, если строка не затронута
 *
 * @invariant targetLine > 0
 *
 * @example
 * ```ts
 * const diffs = [diffFromUpstream, diffFromWorkspace, diffFromIndex];
 * const result = pickSnippetForLine(diffs, 42);
 * if (result) {
 *   console.log(`Found in diff #${result.index}`);
 * }
 * ```
 */
export function pickSnippetForLine(
	candidates: ReadonlyArray<string>,
	targetLine: number,
): { readonly snippet: DiffSnippet; readonly index: number } | null {
	// CHANGE: Precondition check for targetLine
	// WHY: Ensures we only work with valid line numbers (1-based)
	// QUOTE(SPEC): "targetLine must be positive"
	// REF: REQ-20250210-MODULAR-ARCH
	// SOURCE: n/a
	if (targetLine <= 0) {
		throw new Error(`targetLine must be positive, received ${targetLine}`);
	}

	for (let i = 0; i < candidates.length; i += 1) {
		const diff = candidates[i];
		if (!diff || diff.trim().length === 0) {
			continue;
		}
		const snippet = extractDiffSnippet(diff, targetLine);
		if (snippet) {
			return { snippet, index: i };
		}
	}
	return null;
}
