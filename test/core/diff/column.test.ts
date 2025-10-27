// CHANGE: Add deterministic and property-based specs for column conversion invariants
// WHY: Mutation testing highlighted missing coverage for tab-handling branches in src/core/diff/column.ts
// QUOTE(ТЗ): "Можешь покрыть код тестами?"
// REF: USER-REQUEST-20250213
// SOURCE: n/a
// FORMAT THEOREM: ∀s ∈ String, ∀i ∈ ℤ, computeRealColumnFromVisual(s, visualColumnAt(s, i, t), t) = clamp(i, 0, |s|)
// PURITY: CORE
// INVARIANT: Expanded columns preserve visual width even after eliminating tabs
// COMPLEXITY: O(n)/O(1) per assertion — linear scan over input length

import fc from "fast-check";

import {
	computeRealColumnFromVisual,
	expandTabs,
	visualColumnAt,
} from "../../../src/core/diff/column.js";

// CHANGE: Split describe blocks to satisfy max-lines-per-function ESLint rule
// WHY: Single describe with 11 tests exceeds 50-line limit
// REF: ESLint max-lines-per-function rule
describe("computeRealColumnFromVisual", () => {
	it("returns 0 when cursor is at start", () => {
		expect(computeRealColumnFromVisual("\tab", 0)).toBe(0);
	});

	it("returns identical index for ASCII segments without tabs", () => {
		expect(computeRealColumnFromVisual("abcd", 2)).toBe(2);
	});

	it("stops inside a tab", () => {
		expect(computeRealColumnFromVisual("\tab", 6)).toBe(1);
	});

	it("returns glyph after tab at exact tab stop", () => {
		expect(computeRealColumnFromVisual("\tab", 8)).toBe(1);
	});

	it("continues past tab stop", () => {
		expect(computeRealColumnFromVisual("\tab", 9)).toBe(2);
	});

	it("clamps beyond content width", () => {
		expect(computeRealColumnFromVisual("abc", 99)).toBe(3);
	});

	it("throws for negative columns", () => {
		expect(() => computeRealColumnFromVisual("abc", -1)).toThrow();
	});
});

describe("computeRealColumnFromVisual boundary tests", () => {
	it("returns exact length when visualColumn matches end boundary", () => {
		const line = "xyz";
		expect(
			computeRealColumnFromVisual(line, visualColumnAt(line, line.length)),
		).toBe(3);
	});

	it("returns index after char when visualColumn equals nextVisual", () => {
		expect(computeRealColumnFromVisual("abcdefghij", 5)).toBe(5);
	});

	it("handles fractional targets", () => {
		expect(computeRealColumnFromVisual("abc", 0.5)).toBe(1);
	});

	it("distinguishes consecutive tabs at exact tab stop boundary", () => {
		// Kill mutant: currentVisual < visualColumn → currentVisual <= visualColumn
		const twoTabs = "\t\tab";
		expect(computeRealColumnFromVisual(twoTabs, 8)).toBe(1);
		expect(computeRealColumnFromVisual(twoTabs, 16)).toBe(2);
	});

	it("returns exact index when visualColumn matches char boundary", () => {
		// Kill mutant: currentVisual <= visualColumn in isWithinCharRange
		expect(computeRealColumnFromVisual("abcdefgh", 1)).toBe(1);
		expect(computeRealColumnFromVisual("abcdefgh", 4)).toBe(4);
	});

	it("returns length not past length when at final boundary", () => {
		// Kill mutant: index <= lineContent.length
		const line = "test";
		expect(computeRealColumnFromVisual(line, 4)).toBe(4);
		expect(computeRealColumnFromVisual(line, 4)).not.toBe(5);
	});
});

describe("visualColumnAt", () => {
	it("tracks visual width for ASCII-only prefixes", () => {
		expect(visualColumnAt("abcd", 3)).toBe(3);
	});

	it("honors custom tab width offsets", () => {
		expect(visualColumnAt("\tab", 1, 4)).toBe(4);
	});

	it("clamps negative indices to zero", () => {
		expect(visualColumnAt("abc", -5)).toBe(0);
	});

	it("clamps over-long indices to the last character boundary", () => {
		expect(visualColumnAt("a\tb", 100, 8)).toBe(9);
	});
});

describe("expandTabs", () => {
	it("replaces each tab with spaces up to the next stop without altering other characters", () => {
		expect(expandTabs("a\tb", 4)).toBe("a   b");
	});

	it("falls back to TAB_WIDTH when the caller omits tabWidth", () => {
		expect(expandTabs("a\t")).toBe("a       ");
	});
});

describe("column invariants", () => {
	const contentArbitrary = fc
		.array(fc.constantFrom("\t", "a", "b", "c", "x", "y", "z", " "), {
			maxLength: 12,
		})
		.map((chars) => chars.join(""));

	it("computeRealColumnFromVisual is a left inverse of visualColumnAt for every prefix", () => {
		fc.assert(
			fc.property(
				contentArbitrary,
				fc.integer({ min: -5, max: 20 }),
				fc.integer({ min: 2, max: 8 }),
				(content, rawIndex, tabWidth) => {
					const visual = visualColumnAt(content, rawIndex, tabWidth);
					const real = computeRealColumnFromVisual(content, visual, tabWidth);
					const clamped = Math.max(0, Math.min(rawIndex, content.length));
					expect(real).toBe(clamped);
				},
			),
		);
	});

	it("expandTabs removes every tab while preserving total visual width", () => {
		fc.assert(
			fc.property(
				contentArbitrary,
				fc.integer({ min: 2, max: 8 }),
				(content, tabWidth) => {
					const expanded = expandTabs(content, tabWidth);
					expect(expanded.includes("\t")).toBe(false);
					const visualWidth = visualColumnAt(content, content.length, tabWidth);
					expect(expanded.length).toBe(visualWidth);
				},
			),
		);
	});
});
