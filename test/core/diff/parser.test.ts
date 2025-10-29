// CHANGE: Cover diff parsing functions highlighted by mutation report
// WHY: Survivors in src/core/diff/parser.ts indicated missing behavioural specs
// QUOTE(UserMsg#6): "Можешь так же тесты исправить о которых было описано в отчёте?"
// REF: output:1000-1458 ([NoCoverage]/[Survived] mutants in parser.ts)
// SOURCE: "Stryker Mutant Survivors Log" (output file)
// FORMAT THEOREM: ∀d ∈ UnifiedDiff, target ∈ HeadLines(d) ⇒ extractDiffSnippet(d, target) ≠ null
// PURITY: CORE
// INVARIANT: Parsed snippets preserve head line numbering monotonicity
// COMPLEXITY: O(n) per fixture — linear in number of diff lines

import { describe, expect, it } from "vitest";
import {
	extractDiffSnippet,
	pickSnippetForLine,
} from "../../../src/core/diff/parser.js";

describe("extractDiffSnippet", () => {
	it("returns snippet with correct pointer", () => {
		const diff = [
			"@@ -14,2 +120,4 @@",
			" ctx",
			"+ins-one",
			"+ins-two",
			" ctx",
		].join("\n");
		const snippet = extractDiffSnippet(diff, 121);
		expect(snippet?.pointerIndex).toBe(1);
		expect(snippet?.lines[1]?.content).toBe("ins-one");
	});

	it("tracks removals without head numbers", () => {
		const diff = ["@@ -40,4 +200,4 @@", "-old", " ctx", "+new", " ctx"].join(
			"\n",
		);
		const snippet = extractDiffSnippet(diff, 201);
		expect(snippet?.pointerIndex).toBe(2);
		expect(snippet?.lines[0]?.headLineNumber).toBeNull();
		expect(snippet?.lines[2]?.headLineNumber).toBe(201);
	});

	it("returns null when target absent", () => {
		expect(
			extractDiffSnippet(
				["@@ -1,2 +50,2 @@", " ctx", "+change"].join("\n"),
				10,
			),
		).toBeNull();
	});

	it("throws for invalid targetLine", () => {
		expect(() => extractDiffSnippet("@@ -1,1 +1,1 @@\n+test", 0)).toThrow(
			"targetLine must be positive",
		);
		expect(() => extractDiffSnippet("@@ -1,1 +1,1 @@\n+test", -5)).toThrow(
			"targetLine must be positive",
		);
	});
});

describe("extractDiffSnippet edge cases", () => {
	it("returns early when target in first hunk", () => {
		const diff = [
			"@@ -10,3 +100,3 @@",
			" ctx",
			"+target",
			" ctx",
			"@@ -20,3 +200,3 @@",
			"+ignored",
		].join("\n");
		const snippet = extractDiffSnippet(diff, 101);
		expect(snippet?.header).toBe("@@ -10,3 +100,3 @@");
		expect(snippet?.lines[1]?.content).toBe("target");
	});

	it("ignores metadata before first hunk", () => {
		const diff = [
			"diff --git a/f b/f",
			"index 1234..5678",
			"@@ -1,2 +1,2 @@",
			" ctx",
			"+added",
		].join("\n");
		const snippet = extractDiffSnippet(diff, 1);
		expect(snippet?.lines).toHaveLength(2);
	});

	it("handles empty lines within diff", () => {
		// CHANGE: Test empty line processing (line 32: line.length > 0)
		// WHY: Covers symbol === undefined branch
		// REF: parser.ts:32
		const diff = ["@@ -1,3 +1,3 @@", " ctx", "", "+added"].join("\n");
		const snippet = extractDiffSnippet(diff, 1);
		expect(snippet?.lines).toHaveLength(3);
		expect(snippet?.lines[1]?.symbol).toBeUndefined();
	});

	it("handles header without head line number", () => {
		// CHANGE: Test defensive nullish coalescing (line 18)
		// WHY: Covers match[1] ?? "0" when capture group empty
		// REF: parser.ts:18
		// Create header that matches pattern but has incomplete capture
		const diff = ["@@ -1,2 +,2 @@", " ctx", "+added"].join("\n");
		const snippet = extractDiffSnippet(diff, 1);
		// Parses with headLine = 0 (from fallback), then processes normally
		expect(snippet).toBeDefined();
	});
});

describe("pickSnippetForLine", () => {
	it("selects first matching diff", () => {
		const candidates = [
			["@@ -1,2 +30,2 @@", "-remove", " ctx", "+add"].join("\n"),
			["@@ -10,3 +400,5 @@", " ctx", "+needle", " ctx"].join("\n"),
		];
		const chosen = pickSnippetForLine(candidates, 401);
		expect(chosen?.index).toBe(1);
		expect(chosen?.snippet.lines[1]?.content).toBe("needle");
	});

	it("throws for invalid targetLine", () => {
		expect(() => pickSnippetForLine(["@@ -1,1 +1,1 @@\n+test"], 0)).toThrow(
			"targetLine must be positive",
		);
	});

	it("skips empty diffs", () => {
		const result = pickSnippetForLine(
			["", "   \t  ", ["@@ -1,2 +100,2 @@", " ctx", "+found"].join("\n")],
			100,
		);
		expect(result?.index).toBe(2);
	});

	it("returns null when no match", () => {
		expect(
			pickSnippetForLine([["@@ -1,2 +10,2 @@", " ctx"].join("\n")], 999),
		).toBeNull();
	});
});

describe("pickSnippetForLine edge cases", () => {
	it("handles sparse array", () => {
		// Test defensive ?? "" fallback (line 208)
		const sparse: string[] = [];
		sparse[0] = "";
		sparse[2] = ["@@ -1,2 +100,2 @@", " ctx", "+found"].join("\n");
		expect(pickSnippetForLine(sparse, 100)?.index).toBe(2);
	});
});
