// CHANGE: Refactor tests to remove duplicate sequences flagged by jscpd
// WHY: Avoid repeated 'startCol/calculateHighlightRange' blocks using a small helper

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

describe("calculateHighlightRange — typescript branch", () => {
	it("Expected ... arguments — function call context advances to next arg (+1)", () => {
		const currentLine = "fn(a, b)";
		const m = tsMsg({ line: 1, column: 3, message: "Expected 2 arguments" });
		const { start, end } = range(currentLine, m);
		expect(end).toBeGreaterThan(start);
		expect(end).toBeLessThanOrEqual(currentLine.length);
	});

	it("Expected ... arguments — only open paren with spaces uses skipWhitespace", () => {
		const currentLine = "fn(   ";
		const m = tsMsg({ line: 1, column: 3, message: "Expected 2 arguments" });
		const { start, end } = range(currentLine, m);
		expect(end).toBeGreaterThan(start);
		expect(end).toBeLessThanOrEqual(currentLine.length);
	});

	it("Expected ... arguments — no call context → single char", () => {
		expectSingleChar(
			"return a + b",
			tsMsg({ line: 1, column: 3, message: "Expected 2 arguments" }),
		);
	});

	it("Other TS message — word heuristic when starting at letter", () => {
		const currentLine = "fooBar baz";
		const m = tsMsg({ line: 1, column: 1, message: "Some TS message" });
		const { start, end } = range(currentLine, m);
		expect(start).toBe(0);
		expect(end).toBe(6); // "fooBar"
	});

	it("Other TS message — non-word start defaults to single char", () => {
		const currentLine = "(foo)";
		const m = tsMsg({ line: 1, column: 1, message: "TS message" });
		const { start, end } = range(currentLine, m);
		expect(end - start).toBe(1);
	});
});
