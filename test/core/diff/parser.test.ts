// CHANGE: Cover diff parsing functions highlighted by mutation report
// WHY: Survivors in src/core/diff/parser.ts indicated missing behavioural specs
// QUOTE(UserMsg#6): "Можешь так же тесты исправить о которых было описано в отчёте?"
// REF: output:1000-1458 ([NoCoverage]/[Survived] mutants in parser.ts)
// SOURCE: "Stryker Mutant Survivors Log" (output file)
// FORMAT THEOREM: ∀d ∈ UnifiedDiff, target ∈ HeadLines(d) ⇒ extractDiffSnippet(d, target) ≠ null
// PURITY: CORE
// INVARIANT: Parsed snippets preserve head line numbering monotonicity
// COMPLEXITY: O(n) per fixture — linear in number of diff lines

import {
	extractDiffSnippet,
	pickSnippetForLine,
} from "../../../src/core/diff/parser.js";

describe("extractDiffSnippet", () => {
	it("returns a snippet with correct pointer for multi-digit head offsets", () => {
		const diff = [
			"@@ -14,2 +120,4 @@ exports.useful",
			" context-one",
			"+inserted-one",
			"+inserted-two",
			" context-two",
		].join("\n");

		const snippet = extractDiffSnippet(diff, 121);
		if (snippet === null) {
			throw new Error("Expected diff snippet for head line 121");
		}
		expect(snippet.header).toBe("@@ -14,2 +120,4 @@ exports.useful");
		expect(snippet.pointerIndex).toBe(1);
		expect(snippet.lines.map((line) => line.headLineNumber)).toEqual([
			120, 121, 122, 123,
		]);
		expect(snippet.lines[1]?.content).toBe("inserted-one");
	});

	it("tracks context lines following removals without head numbers for '-' lines", () => {
		const diff = ["@@ -40,4 +200,4 @@", "-old", " ctx", "+new", " ctx"].join(
			"\n",
		);

		const snippet = extractDiffSnippet(diff, 201);
		if (snippet === null) {
			throw new Error("Expected diff snippet for head line 201");
		}
		expect(snippet.pointerIndex).toBe(2);
		expect(snippet.lines[0]?.headLineNumber).toBeNull();
		expect(snippet.lines[2]?.headLineNumber).toBe(201);
	});

	it("returns null when the target head line is absent from every hunk", () => {
		expect(
			extractDiffSnippet(
				["@@ -1,2 +50,2 @@", " ctx", "+change", " ctx"].join("\n"),
				10,
			),
		).toBeNull();
	});
});

describe("pickSnippetForLine", () => {
	it("selects the first diff providing the requested head line", () => {
		const candidates = [
			["@@ -1,2 +30,2 @@ alpha", "-remove", " context", "+add"].join("\n"),
			[
				"@@ -10,3 +400,5 @@ beta",
				" context-one",
				"+needle",
				"+needle-context",
				" context-two",
			].join("\n"),
		] as const;

		const chosen = pickSnippetForLine(candidates, 401);
		if (chosen === null) {
			throw new Error("Expected diff snippet selection for head line 401");
		}
		const matched = chosen;
		expect(matched.index).toBe(1);
		expect(matched.snippet.lines[1]?.content).toBe("needle");
		expect(matched.snippet.pointerIndex).toBe(1);
	});
});
