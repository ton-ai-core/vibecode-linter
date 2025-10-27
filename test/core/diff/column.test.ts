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

describe("computeRealColumnFromVisual", () => {
	it("returns identical index for ASCII segments without tabs", () => {
		expect(computeRealColumnFromVisual("abcd", 2)).toBe(2);
	});

	it("stops inside a tab once the desired visual column is reached", () => {
		expect(computeRealColumnFromVisual("\tab", 6)).toBe(1);
	});

	it("continues scanning when the target column is beyond the first tab stop", () => {
		expect(computeRealColumnFromVisual("\tab", 9)).toBe(2);
	});

	it("clamps to the end of the string when the visual column exceeds content width", () => {
		expect(computeRealColumnFromVisual("abc", 99)).toBe(3);
	});

	it("throws for negative visual columns to protect the invariant visualColumn >= 0", () => {
		expect(() => computeRealColumnFromVisual("abc", -1)).toThrow(
			"visualColumn must be non-negative",
		);
	});

	it("returns the earliest index whose visual column strictly exceeds fractional targets", () => {
		expect(computeRealColumnFromVisual("abc", 0.5)).toBe(1);
	});

	it("falls back to the input length for malformed diff chunks where iteration never executes", () => {
		// WHY: Emulate truncated diff metadata to exercise the defensive return at lineContent.length
		// REF: USER-REQUEST-20250213
		// NOTE: Casting is deliberate to surface the final return guard when Git diffs are corrupted
		const malformedLine: string = { length: -1 } as string;
		expect(computeRealColumnFromVisual(malformedLine, 0)).toBe(-1);
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
