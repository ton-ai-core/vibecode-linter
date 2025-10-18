// CHANGE: Extracted diff parsing functions from lint.ts
// WHY: Diff parsing logic should be in a separate module for better testability
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import type { DiffLineView, DiffSnippet } from "../types/index.js";

const UNIFIED_HEADER_PATTERN = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Извлекает из unified diff тот фрагмент, который содержит указанную строку из HEAD.
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

	let currentHeader = "";
	let currentLines: DiffLineView[] = [];
	let currentPointer: number | null = null;
	let headLine = 0;

	const flushSnippet = (): DiffSnippet | null => {
		if (currentHeader && currentPointer !== null) {
			return {
				header: currentHeader,
				lines: currentLines,
				pointerIndex: currentPointer,
			};
		}
		return null;
	};

	for (const line of lines) {
		if (line.startsWith("@@")) {
			const maybeSnippet = flushSnippet();
			if (maybeSnippet) {
				return maybeSnippet;
			}

			currentHeader = line;
			currentLines = [];
			currentPointer = null;
			const match = UNIFIED_HEADER_PATTERN.exec(line);
			headLine = match ? Number.parseInt(match[1] ?? "0", 10) : 0;
			continue;
		}

		if (!currentHeader) {
			continue;
		}

		const symbol = line.length > 0 ? line[0] : undefined;
		let headLineNumber: number | null = null;

		if (symbol === "+" || symbol === " ") {
			headLineNumber = headLine;
			headLine += 1;
		} else if (symbol === "-") {
			// Удаленные строки не увеличивают headLine
		} else {
			// Строки вида "\ No newline at end of file" и другие служебные
		}

		const content = symbol ? line.slice(1) : line;
		currentLines.push({
			raw: line,
			symbol: symbol as DiffLineView["symbol"],
			headLineNumber,
			content,
		});

		if (headLineNumber === targetLine) {
			currentPointer = currentLines.length - 1;
		}
	}

	return flushSnippet();
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
