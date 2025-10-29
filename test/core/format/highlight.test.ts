// CHANGE: Unit tests for calculateColumnPosition (split to satisfy max-lines-per-function)
// WHY: Keep each test block under rule limit and improve coverage for core

import { describe, expect, it } from "vitest";
import { calculateColumnPosition } from "../../../src/core/format/highlight.js";

describe("calculateColumnPosition", () => {
	it("returns start of line for visual column 0", () => {
		expect(calculateColumnPosition("abc", 0)).toBe(0);
	});

	it("returns index equal to visual column for simple ascii", () => {
		expect(calculateColumnPosition("abc", 1)).toBe(1);
		expect(calculateColumnPosition("abc", 2)).toBe(2);
		expect(calculateColumnPosition("abc", 3)).toBe(3);
	});

	it("accounts tab width = 8", () => {
		// Line starts with a tab, visual width jumps from 0 to 8 at index 0
		// Target visual 7 -> needs first char to be consumed, index becomes 1
		expect(calculateColumnPosition("\tab", 7)).toBe(1);
		// Target visual 8 -> still at first char boundary -> index 1
		expect(calculateColumnPosition("\tab", 8)).toBe(1);
	});

	it("clamps to line length when target beyond end", () => {
		expect(calculateColumnPosition("abc", 100)).toBe(3);
	});

	it("handles carriage return without advancing width", () => {
		// visual map: 'a' -> 1, '\r' -> 1, 'b' -> 2
		expect(calculateColumnPosition("a\rb", 1)).toBe(1);
		expect(calculateColumnPosition("a\rb", 2)).toBe(3);
	});
});
