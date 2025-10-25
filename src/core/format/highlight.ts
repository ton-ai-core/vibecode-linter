// CHANGE: Extract pure highlight/formatting utilities from shell/output
// WHY: FCIS — keep all pure computations in CORE; SHELL only does IO (console/file)
// QUOTE(ТЗ): "CORE: Исключительно чистые функции, неизменяемые данные"
// REF: Architecture plan - move output formatting logic to core
// PURITY: CORE
// INVARIANT: No side effects; deterministic mapping from inputs to outputs
// COMPLEXITY: O(n) per line where n = |currentLine|

import type { LintMessageWithFile } from "../types/index.js";

/**
 * Calculate next visual width when consuming a character.
 *
 * @pure true
 */
function calculateVisualWidth(char: string, currentVisual: number): number {
	if (char === "\t") {
		const tabSize = 8;
		return Math.floor(currentVisual / tabSize + 1) * tabSize;
	}
	if (char === "\r") return currentVisual;
	return currentVisual + 1;
}

/**
 * Find real (string index) column for a desired visual column on a line.
 *
 * @param currentLine - immutable line content
 * @param targetVisualColumn - desired visual column (0-based)
 * @returns real column index (0..line.length)
 *
 * @pure true
 * @invariant 0 ≤ result ≤ currentLine.length
 * @complexity O(n) where n = |currentLine|
 */
export function calculateColumnPosition(
	currentLine: string,
	targetVisualColumn: number,
): number {
	let realColumn = 0;
	let visualColumn = 0;

	for (let charIndex = 0; charIndex <= currentLine.length; charIndex += 1) {
		if (visualColumn >= targetVisualColumn) {
			realColumn = charIndex;
			break;
		}
		if (charIndex >= currentLine.length) {
			realColumn = currentLine.length;
			break;
		}

		const ch = currentLine.charAt(charIndex);
		// exact-optional-char handling
		if (ch !== "") visualColumn = calculateVisualWidth(ch, visualColumn);
	}

	if (visualColumn < targetVisualColumn) realColumn = currentLine.length;
	return Math.max(0, Math.min(realColumn, currentLine.length));
}

/**
 * Skip whitespace in a line starting from given index.
 *
 * @pure true
 * @invariant while ensures pos < length → charAt(pos) !== ""
 */
function skipWhitespace(line: string, start: number): number {
	let pos = start;
	while (pos < line.length) {
		const ch = line.charAt(pos);
		// CHANGE: Remove ch === "" check (unreachable due to while condition)
		// WHY: while ensures pos < line.length → charAt never returns ""
		// INVARIANT: ∀ pos < line.length. charAt(pos) ∈ line (non-empty)
		if (!/\s/.test(ch)) break;
		pos += 1;
	}
	return pos;
}

/**
 * Heuristic: when TS complains about "Expected N arguments", highlight
 * from next argument position.
 *
 * @pure true
 * @invariant funcCallMatch exists → "(" found in string → openParenPos ≥ 0
 */
function calculateFunctionArgsEnd(
	currentLine: string,
	startCol: number,
): number {
	const beforeCursor = currentLine.substring(0, startCol + 15);
	const funcCallMatch = beforeCursor.match(
		/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*$/,
	);
	if (!funcCallMatch) return startCol + 1;

	// CHANGE: Remove targetPos === -1 check (unreachable)
	// WHY: Regex /\([^)]*$/ guarantees "(" exists → indexOf("(") >= 0
	// INVARIANT: funcCallMatch exists → openParenPos >= 0 → targetPos >= 0
	const lastCommaPos = beforeCursor.lastIndexOf(",");
	const openParenPos = beforeCursor.lastIndexOf("(");
	const targetPos = Math.max(lastCommaPos, openParenPos);

	const newStartCol = skipWhitespace(currentLine, targetPos + 1);
	return newStartCol + 1;
}

/**
 * Heuristic: highlight a word at the given start when not TypeScript specific.
 *
 * @pure true
 * @invariant charAtPos ∈ [a-zA-Z_$] → wordMatch !== null
 */
function calculateWordEnd(currentLine: string, startCol: number): number {
	const charAtPos = currentLine.charAt(startCol);
	if (charAtPos === "" || !/[a-zA-Z_$]/.test(charAtPos)) return startCol + 1;

	// CHANGE: Remove unreachable defensive code, use optional chaining for type safety
	// WHY: After charAtPos passes /[a-zA-Z_$]/ test, match always succeeds
	// INVARIANT: ∀ line, col: charAt(col) ∈ [a-zA-Z_$] → match finds ≥1 char
	// NOTE: Using ?. instead of ! to satisfy Biome linter (mathematically guaranteed non-null)
	const remainingLine = currentLine.substring(startCol);
	const wordMatch = remainingLine.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
	const wordLen = wordMatch?.[0].length ?? 1;
	return Math.min(startCol + wordLen, currentLine.length);
}

/**
 * Compute highlight range for a lint message on a given line.
 *
 * @param m - LintMessage with file and positions
 * @param currentLine - line content
 * @param startCol - starting real column index
 * @returns [start, end) range as closed interval on string indices
 *
 * @pure true
 * @invariant 0 ≤ start ≤ end ≤ currentLine.length
 * @complexity O(1) (heuristics) + O(k) where k depends on local parsing
 */
export function calculateHighlightRange(
	m: LintMessageWithFile,
	currentLine: string,
	startCol: number,
): { start: number; end: number } {
	const { source, message } = m;

	let endCol: number;
	if (
		"endColumn" in m &&
		typeof m.endColumn === "number" &&
		Number.isFinite(m.endColumn)
	) {
		endCol = Math.min(m.endColumn - 1, currentLine.length);
	} else if (source === "typescript") {
		if (message.includes("Expected") && message.includes("arguments")) {
			endCol = calculateFunctionArgsEnd(currentLine, startCol);
		} else {
			endCol = calculateWordEnd(currentLine, startCol);
		}
	} else {
		endCol = startCol + 1;
	}

	const start = startCol;
	const end = Math.max(start, Math.min(endCol, currentLine.length));
	return { start, end };
}
