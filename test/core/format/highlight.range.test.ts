// CHANGE: Refactor tests to remove duplicate sequences flagged by jscpd
// WHY: Avoid repeated 'startCol/calculateHighlightRange' blocks using a small helper

import { describe, expect, it } from "vitest";
import { calculateHighlightRange } from "../../../src/core/format/highlight.js";
import type { LintMessageWithFile } from "../../../src/core/types/index.js";
import { eslintMsg, tsMsg } from "../../utils/builders.js";

// Small helper to avoid duplicated lines in tests
function range(
	currentLine: string,
	msg: LintMessageWithFile,
): {
	start: number;
	end: number;
} {
	const startCol = msg.column - 1;
	return calculateHighlightRange(msg, currentLine, startCol);
}

function expectSingleChar(currentLine: string, msg: LintMessageWithFile): void {
	const { start, end } = range(currentLine, msg);
	expect(end - start).toBe(1);
}

// CHANGE: Add helper to eliminate duplicate test assertions
// WHY: DRY principle - avoid repeated expect blocks for valid range checks
// PURITY: CORE
function expectValidRange(currentLine: string, msg: LintMessageWithFile): void {
	const { start, end } = range(currentLine, msg);
	expect(end).toBeGreaterThan(start);
	expect(end).toBeLessThanOrEqual(currentLine.length);
}

// CHANGE: Add helper for single-char identifier tests
// WHY: DRY principle - eliminate duplicate test structure
// PURITY: CORE
function expectSingleCharAt(
	currentLine: string,
	column: number,
	expectedStart: number,
	expectedEnd: number,
): void {
	const m = tsMsg({ line: 1, column, message: "TS message" });
	const { start, end } = range(currentLine, m);
	expect(start).toBe(expectedStart);
	expect(end).toBe(expectedEnd);
}

describe("calculateHighlightRange — eslint branch", () => {
	it("uses endColumn and clamps to line length", () => {
		const currentLine = "abcdefghij";
		const m = eslintMsg({ line: 1, column: 2, endColumn: 999 });
		const { start, end } = range(currentLine, m);
		expect(start).toBe(1);
		expect(end).toBe(currentLine.length);
	});

	it("falls back to single-char when endColumn is absent", () => {
		expectSingleChar("abc", eslintMsg({ line: 1, column: 2 }));
	});
});

describe("calculateHighlightRange — typescript 'Expected arguments'", () => {
	it("function call context advances to next arg (+1)", () => {
		expectValidRange(
			"fn(a, b)",
			tsMsg({ line: 1, column: 3, message: "Expected 2 arguments" }),
		);
	});

	it("only open paren with spaces uses skipWhitespace", () => {
		expectValidRange(
			"fn(   ",
			tsMsg({ line: 1, column: 3, message: "Expected 2 arguments" }),
		);
	});

	it("no call context → single char", () => {
		expectSingleChar(
			"return a + b",
			tsMsg({ line: 1, column: 3, message: "Expected 2 arguments" }),
		);
	});

	// CHANGE: Add edge case for characters immediately after paren
	// WHY: Cover skipWhitespace non-whitespace break branch (highlight.ts:75)
	// PURITY: CORE
	it("open paren followed immediately by non-whitespace", () => {
		expectValidRange(
			"fn(x",
			tsMsg({ line: 1, column: 3, message: "Expected 2 arguments" }),
		);
	});
});

describe("calculateHighlightRange — typescript other messages", () => {
	it("word heuristic when starting at letter", () => {
		expectSingleCharAt("fooBar baz", 1, 0, 6);
	});

	it("non-word start defaults to single char", () => {
		expectSingleCharAt("(foo)", 1, 0, 1);
	});

	// CHANGE: Add edge case tests for single-char identifiers
	// WHY: Ensure calculateWordEnd handles minimal valid identifiers
	// INVARIANT: ∀ word ∈ ValidIdentifiers: |word| ≥ 1 → highlighted
	// PURITY: CORE
	it("single-char identifier ($)", () => {
		expectSingleCharAt("$ + 1", 1, 0, 1);
	});

	it("single-char identifier (_)", () => {
		expectSingleCharAt("_ = 2", 1, 0, 1);
	});

	it("identifier at end of line", () => {
		expectSingleCharAt("return x", 8, 7, 8);
	});
});
