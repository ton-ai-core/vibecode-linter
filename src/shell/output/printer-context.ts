// CHANGE: Extracted context printing helpers
// WHY: Keeps printer-helpers.ts under 300 lines
// REF: ESLint max-lines
import { expandTabs } from "../../core/diff/index.js";
import {
	calculateColumnPosition,
	calculateHighlightRange,
} from "../../core/format/highlight.js";
import type {
	GitDiffBlock,
	LintMessageWithFile,
} from "../../core/types/index.js";
import type { CommitDiffBlock } from "../git/history-helpers.js";

export function printFileContext(
	m: LintMessageWithFile,
	lines: ReadonlyArray<string>,
	diffBlock: GitDiffBlock | null,
): void {
	const { line, column } = m;
	const start = Math.max(line - 3, 0);
	const end = Math.min(line + 2, lines.length);
	const diffLineNumbers =
		diffBlock !== null ? new Set(diffBlock.headLineNumbers) : new Set<number>();

	for (let i = start; i < end; i += 1) {
		const printedFromDiff = diffBlock !== null && diffLineNumbers.has(i + 1);
		if (printedFromDiff) continue;

		const prefix = i === line - 1 ? ">" : " ";
		const num = String(i + 1).padStart(4);
		const currentLine = lines.at(i) ?? "";
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
		symbol?: string | undefined;
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
		// CHANGE: Avoid truthiness on possibly undefined line and symbol
		// WHY: strict-boolean-expressions — explicit undefined checks
		// REF: REQ-LINT-FIX
		if (line === undefined || line.symbol === undefined) continue;

		if (line.symbol === "-") removed.push(line);
		else if (line.symbol === "+") added.push(line);
		else if (line.symbol === " ") context.push(line);
	}

	return { removed, added, context };
}

export function printCommitDiffSnippet(block: CommitDiffBlock): void {
	// CHANGE: Avoid truthiness on nullable diffSnippet
	// WHY: strict-boolean-expressions — explicit null check
	// REF: REQ-LINT-FIX
	if (block.diffSnippet === null) return;

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
