// CHANGE: Extracted context printing helpers
// WHY: Keeps printer-helpers.ts under 300 lines
// REF: ESLint max-lines
import { expandTabs } from "../diff/index";
import type { CommitDiffBlock } from "../git/history-helpers";
import type { GitDiffBlock, LintMessageWithFile } from "../types/index";

function calculateVisualWidth(char: string, currentVisual: number): number {
	if (char === "\t") {
		const tabSize = 8;
		return Math.floor(currentVisual / tabSize + 1) * tabSize;
	}
	if (char === "\r") return currentVisual;
	return currentVisual + 1;
}

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

		const char = currentLine[charIndex];
		if (char) visualColumn = calculateVisualWidth(char, visualColumn);
	}

	if (visualColumn < targetVisualColumn) realColumn = currentLine.length;
	return Math.max(0, Math.min(realColumn, currentLine.length));
}

function skipWhitespace(line: string, start: number): number {
	let pos = start;
	while (pos < line.length) {
		const char = line[pos];
		if (!char || !/\s/.test(char)) break;
		pos += 1;
	}
	return pos;
}

function calculateFunctionArgsEnd(
	currentLine: string,
	startCol: number,
): number {
	const beforeCursor = currentLine.substring(0, startCol + 15);
	const funcCallMatch = beforeCursor.match(
		/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*$/,
	);
	if (!funcCallMatch) return startCol + 1;

	const lastCommaPos = beforeCursor.lastIndexOf(",");
	const openParenPos = beforeCursor.lastIndexOf("(");
	const targetPos = Math.max(lastCommaPos, openParenPos);
	if (targetPos === -1) return startCol + 1;

	const newStartCol = skipWhitespace(currentLine, targetPos + 1);
	return newStartCol + 1;
}

function calculateWordEnd(currentLine: string, startCol: number): number {
	const charAtPos = currentLine[startCol];
	if (!charAtPos || !/[a-zA-Z_$]/.test(charAtPos)) return startCol + 1;

	const remainingLine = currentLine.substring(startCol);
	const wordMatch = remainingLine.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
	if (wordMatch) {
		return Math.min(startCol + wordMatch[0].length, currentLine.length);
	}
	return startCol + 1;
}

export function calculateHighlightRange(
	m: LintMessageWithFile,
	currentLine: string,
	startCol: number,
): { start: number; end: number } {
	const { source, message } = m;

	let endCol: number;
	if ("endColumn" in m && m.endColumn) {
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

	return { start: startCol, end: endCol };
}

export function printFileContext(
	m: LintMessageWithFile,
	lines: ReadonlyArray<string>,
	diffBlock: GitDiffBlock | null,
): void {
	const { line, column } = m;
	const start = Math.max(line - 3, 0);
	const end = Math.min(line + 2, lines.length);
	const diffLineNumbers = diffBlock
		? new Set(diffBlock.headLineNumbers)
		: new Set<number>();

	for (let i = start; i < end; i += 1) {
		const printedFromDiff = diffBlock && diffLineNumbers.has(i + 1);
		if (printedFromDiff) continue;

		const prefix = i === line - 1 ? ">" : " ";
		const num = String(i + 1).padStart(4);
		const currentLine = lines[i] || "";
		const lineContent = ` ${prefix} ${num} | ${currentLine}`;
		console.log(lineContent);

		if (i === line - 1) {
			const prefixLength = ` ${prefix} ${num} | `.length;
			const targetVisualColumn = column - 1;
			const startCol = calculateColumnPosition(currentLine, targetVisualColumn);
			const { start, end } = calculateHighlightRange(m, currentLine, startCol);

			const beforeHighlight = " ".repeat(prefixLength + start);
			const highlightLength = Math.max(1, end - start);
			const highlight = "^".repeat(highlightLength);
			console.log(`${beforeHighlight}${highlight}`);
		}
	}
}

function printDiffLines(
	lines: ReadonlyArray<{ headLineNumber: number | null; content: string }>,
	prefix: string,
	maxLines: number,
): void {
	for (const line of lines.slice(0, maxLines)) {
		const lineNumber =
			line.headLineNumber !== null
				? String(line.headLineNumber).padStart(4)
				: "    ";
		console.log(`    ${prefix} ${lineNumber} | ${expandTabs(line.content, 8)}`);
	}
	if (lines.length > maxLines) {
		console.log("          ... (see full diff with git command above)");
	}
}

function categorizeDiffLines(
	lines: ReadonlyArray<{
		symbol?: string;
		headLineNumber: number | null;
		content: string;
	}>,
	startIdx: number,
	endIdx: number,
): {
	removed: Array<{ headLineNumber: number | null; content: string }>;
	added: Array<{ headLineNumber: number | null; content: string }>;
	context: Array<{ headLineNumber: number | null; content: string }>;
} {
	const removed: Array<{ headLineNumber: number | null; content: string }> = [];
	const added: Array<{ headLineNumber: number | null; content: string }> = [];
	const context: Array<{ headLineNumber: number | null; content: string }> = [];

	for (let i = startIdx; i < endIdx; i += 1) {
		const line = lines[i];
		if (!line || !line.symbol) continue;

		if (line.symbol === "-") removed.push(line);
		else if (line.symbol === "+") added.push(line);
		else if (line.symbol === " ") context.push(line);
	}

	return { removed, added, context };
}

export function printCommitDiffSnippet(block: CommitDiffBlock): void {
	if (!block.diffSnippet) return;

	console.log(`    ${block.diffSnippet.header}`);

	const { pointerIndex, lines: diffLines } = block.diffSnippet;
	let startIdx = 0;
	let endIdx = diffLines.length;

	if (pointerIndex !== null) {
		const contextSize = 3;
		startIdx = Math.max(0, pointerIndex - contextSize);
		endIdx = Math.min(diffLines.length, pointerIndex + contextSize + 1);
	}

	const { removed, added, context } = categorizeDiffLines(
		diffLines,
		startIdx,
		endIdx,
	);

	printDiffLines(context.slice(0, 3), " ", 3);
	if (removed.length > 0) printDiffLines(removed, "-", 5);
	if (added.length > 0) printDiffLines(added, "+", 5);
	printDiffLines(context.slice(3, 6), " ", 3);

	console.log(
		"    ---------------------------------------------------------------",
	);
}
