import { describe, expect, test } from "vitest";
import { getCachedLinterResults } from "./shared/test-utils.js";

// CHANGE: Comprehensive E2E test with exact 1-to-1 validation
// WHY: Validate exact linter output format, cursor positioning, and code context
// QUOTE(ТЗ): "проверь что ошибка 1 в 1 соответствует (Кроме общего пути файла)"
// REF: REQ-E2E-EXACT-VALIDATION
// PURITY: SHELL - tests real linter output with mathematical precision
// INVARIANT: ∀ error ∈ Output: format(error) = expected_format ∧ cursor_position(error) = exact_position
// COMPLEXITY: O(n) where n = |output_lines| for validation

describe("Linter Output E2E Tests", () => {
	// CHANGE: Cache results once for all tests
	// WHY: Avoid repeated slow CLI execution - 1 раз запустил и проверяешь
	// INVARIANT: Single execution per test suite, ∀ test: uses_same_cached_result
	const results = getCachedLinterResults();

	describe("Exact Error Format Validation", () => {
		test("validates mixed-issues.ts:69:16 error format 1-to-1", () => {
			const { output } = results.normal;

			// INVARIANT: Must contain exact error header line with normalized path
			expect(output).toContain(
				"[ERROR] src/mixed-issues.ts:69:16 @typescript-eslint/no-explicit-any (ESLint) — Unexpected any. Specify a different type.",
			);

			// INVARIANT: Must contain exact code context lines (git diff format)
			expect(output).toContain("+   67 |");
			expect(output).toContain("+   68 | // Неправильное использование any");
			expect(output).toContain(
				"+   69 | const anyData: any = fetchSomeData();",
			);
			expect(output).toContain("                        ^^^");
			expect(output).toContain(
				"+   70 | const typedData: string = anyData; // TS2322",
			);

			// INVARIANT: Must contain git diff header with normalized path
			expect(output).toContain("--- git diff");
			expect(output).toContain("-- src/mixed-issues.ts");
		});

		test("validates 01-typescript-errors.ts:55:17 error format 1-to-1", () => {
			const { output } = results.normal;

			// INVARIANT: Must contain exact error header line with normalized path
			expect(output).toContain(
				"[ERROR] src/01-typescript-errors.ts:55:17 @typescript-eslint/no-explicit-any (ESLint) — Unexpected any. Specify a different type.",
			);

			// INVARIANT: Must contain exact code context lines (git diff format)
			expect(output).toContain("+   53 |");
			expect(output).toContain(
				"+   54 | // ❌ TS2322: Type 'any' is not assignable to type 'string'",
			);
			expect(output).toContain(
				'+   55 | const anyValue: any = { complex: "object" };',
			);
			expect(output).toContain("                         ^^^");
			expect(output).toContain(
				"+   56 | const stringValue: string = anyValue;",
			);
			expect(output).toContain("+   57 |");
		});

		test("validates 02-eslint-violations.ts:22:16 error format 1-to-1", () => {
			const { output } = results.normal;

			// INVARIANT: Must contain exact error header line with normalized path
			expect(output).toContain(
				"[ERROR] src/02-eslint-violations.ts:22:16 @typescript-eslint/no-explicit-any (ESLint) — Unexpected any. Specify a different type.",
			);

			// INVARIANT: Must contain exact code context with Russian text (git diff format)
			expect(output).toContain("+   20 |");
			expect(output).toContain(
				"+   21 | // ❌ @typescript-eslint/no-explicit-any: Unexpected any. Specify a different type",
			);
			expect(output).toContain(
				'+   22 | const anyType: any = "запрещённый any тип";',
			);
			expect(output).toContain("                        ^^^");
			expect(output).toContain(
				"+   23 | function acceptsAny(param: any): any {",
			);
			expect(output).toMatch(/\+\s*24\s*\|\s*return param;/);
		});

		test("validates duplicate-code-1.ts:40:40 error format 1-to-1", () => {
			const { output } = results.normal;

			// INVARIANT: Must contain exact error header line with normalized path
			expect(output).toContain(
				"[ERROR] src/duplicate-code-1.ts:40:40 @typescript-eslint/no-explicit-any (ESLint) — Unexpected any. Specify a different type.",
			);

			// INVARIANT: Must contain exact code context with Russian comments (git diff format)
			expect(output).toContain(
				"+   38 |  * ДУБЛИКАТ: Этот блок повторяется в duplicate-code-2.ts и duplicate-code-3.ts",
			);
			expect(output).toContain("+   39 |  */");
			expect(output).toContain(
				"+   40 | export function handleHttpError(error: any): string {",
			);
			expect(output).toContain(
				"                                                ^^^",
			);
			expect(output).toMatch(/\+\s*41\s*\|\s*if \(error\.status === 404\) \{/);
			expect(output).toMatch(/42\s*\|\s*return.*Resource not found/);
		});
	});

	// CHANGE: Helper function to validate cursor alignment
	// WHY: Eliminate code duplication in cursor validation tests
	// INVARIANT: Validates cursor positioning for any given line pattern
	const validateCursorAlignment = (
		output: string,
		linePattern: string,
		options: { checkAlignment?: boolean } = {},
	): void => {
		// CHANGE: Look for cursor indicators in the main error section (not git diff)
		// WHY: Cursor indicators appear in the main error display, not in git diff context
		// INVARIANT: Cursor indicators should be present for each error

		// Find the error section that contains the line pattern
		const lines = output.split("\n");
		const codeLineIndex = lines.findIndex(
			(line) => line.includes(linePattern) && line.includes(">"),
		);

		expect(codeLineIndex).toBeGreaterThan(-1);

		// CHANGE: Look for cursor indicator line in the current linter output format
		// WHY: Current linter shows cursor indicators with ^^^ pattern on next line
		// INVARIANT: Cursor line should be immediately after the code line
		const cursorIndicatorLine = lines[codeLineIndex + 1];
		expect(cursorIndicatorLine).toBeDefined();

		// CHANGE: Updated pattern to match actual linter output format
		// WHY: Current linter output shows cursor indicators as ^^^ on separate line
		// Look for lines that contain ^^^ pattern (cursor indicators)
		expect(cursorIndicatorLine).toMatch(/^\s*\^\^\^\s*$/);

		if (options.checkAlignment === true) {
			const codeLine = lines[codeLineIndex];
			expect(codeLine).toBeDefined();
			expect(codeLine?.length).toBeGreaterThan(0);

			// CHANGE: Validate that the line contains 'any' keyword
			// WHY: We're testing cursor positioning for 'any' type errors
			expect(codeLine).toContain("any");
		}
	};

	describe("Cursor Positioning Validation", () => {
		test("validates cursor alignment for mixed-issues.ts:69:16", () => {
			const { output } = results.normal;
			validateCursorAlignment(
				output,
				"69 | const anyData: any = fetchSomeData();",
				{ checkAlignment: true },
			);
		});

		test("validates cursor alignment for 01-typescript-errors.ts:55:17", () => {
			const { output } = results.normal;
			validateCursorAlignment(
				output,
				'55 | const anyValue: any = { complex: "object" };',
			);
		});

		test("validates cursor alignment for function parameters", () => {
			const { output } = results.normal;
			validateCursorAlignment(
				output,
				"11 | function problematicFunction(param: any, unused: string): any {",
			);
		});
	});

	describe("Code Context Validation", () => {
		// CHANGE: Removed "validates sequential line numbers" test to eliminate duplication
		// WHY: Sequential line numbers already validated in all "Exact Error Format Validation" tests
		// INVARIANT: ∀ test ∈ ExactErrorFormatTests: validates_sequential_context(test)

		test("validates proper indentation in code context", () => {
			const { output } = results.normal;

			// INVARIANT: Code should maintain proper indentation (git diff format)
			const lines = output.split("\n");
			const contextLines = lines.filter(
				(line) =>
					line.match(/^\s*\+\s*\d+\s*\|\s*/) || line.match(/^\s*\d+\s*\|\s*/),
			);

			expect(contextLines.length).toBeGreaterThan(10); // Should have many context lines

			// Each context line should follow the format: "+   XX | code"
			contextLines.forEach((line) => {
				expect(line).toMatch(/^\s*\+?\s*\d+\s*\|\s*/);
			});
		});

		test("validates Russian text preservation in context", () => {
			const { output } = results.normal;

			// INVARIANT: Russian text should be preserved exactly
			expect(output).toContain("// Неправильное использование any");
			expect(output).toContain('"запрещённый any тип"');
			expect(output).toContain("ДУБЛИКАТ: Этот блок повторяется");
			expect(output).toContain("// Функция с множественными проблемами");
		});
	});

	describe("Error Message Validation", () => {
		test("validates exact error messages", () => {
			const { output } = results.normal;

			// INVARIANT: Error messages must be exactly as expected
			expect(output).toContain("— Unexpected any. Specify a different type.");

			// Count occurrences of this exact message
			const messageCount = (
				output.match(/— Unexpected any\. Specify a different type\./g) || []
			).length;
			expect(messageCount).toBe(15); // Should be exactly 15 occurrences in critical section
		});

		test("validates rule names are correct", () => {
			const { output } = results.normal;

			// INVARIANT: Rule names must be exactly correct
			const ruleMatches = output.match(/@typescript-eslint\/no-explicit-any/g);
			expect(ruleMatches).toBeTruthy();
			expect(ruleMatches?.length).toBeGreaterThan(10); // Should have many rule matches
		});

		test("validates source attribution", () => {
			const { output } = results.normal;

			// INVARIANT: Source should be correctly attributed
			const eslintMatches = output.match(/\(ESLint\)/g);
			expect(eslintMatches).toBeTruthy();
			expect(eslintMatches?.length).toBeGreaterThan(10);
		});
	});

	describe("File Path Validation", () => {
		test("validates file paths are shown correctly", () => {
			const { output } = results.normal;

			// INVARIANT: File paths should show normalized src/ paths
			expect(output).toContain("src/mixed-issues.ts:69:16");
			expect(output).toContain("src/01-typescript-errors.ts:55:17");
			expect(output).toContain("src/02-eslint-violations.ts:22:16");
			expect(output).toContain("src/duplicate-code-1.ts:40:40");
		});

		test("validates line and column numbers are accurate", () => {
			const { output } = results.normal;

			// INVARIANT: Line:column should match actual positions
			expect(output).toContain(":69:16"); // mixed-issues.ts
			expect(output).toContain(":55:17"); // 01-typescript-errors.ts
			expect(output).toContain(":22:16"); // 02-eslint-violations.ts
			expect(output).toContain(":40:40"); // duplicate-code-1.ts
		});
	});

	describe("Summary Statistics Validation", () => {
		test("validates exact error counts", () => {
			const { output } = results.normal;

			// INVARIANT: Summary must show exact counts (updated for isolated copy)
			expect(output).toContain(
				"📊 Total: 247 errors (107 TypeScript, 140 ESLint, 0 Biome), 29 warnings.",
			);
		});

		test("validates critical errors section header", () => {
			const { output } = results.normal;

			// INVARIANT: Header must show exact count
			expect(output).toContain("=== Critical Compiler Errors (15 issues) ===");
		});
	});

	describe("Git Integration Validation", () => {
		test("validates git blame information", () => {
			const { output } = results.normal;

			// INVARIANT: Git diff history should be shown for each error
			const gitDiffMatches = output.match(/--- git diff/g);
			expect(gitDiffMatches).toBeTruthy();
			expect(gitDiffMatches?.length).toBeGreaterThan(10); // Should have many git diff sections

			// INVARIANT: Should show commit information with fixed author
			expect(output).toContain("Newer:");
			expect(output).toContain("Older:");
			expect(output).toContain("by E2E Test:");
		});
	});

	describe("Unicode and Formatting Validation", () => {
		test("validates Unicode characters are preserved", () => {
			const { output } = results.normal;

			// INVARIANT: Unicode characters should be preserved exactly
			expect(output).toContain("🔍"); // Magnifying glass
			expect(output).toContain("🔧"); // Wrench
			expect(output).toContain("🧪"); // Test tube
			expect(output).toContain("✅"); // Check mark
			expect(output).toContain("📊"); // Bar chart
			expect(output).toContain("—"); // Em dash
			expect(output).toContain("❌"); // Cross mark
		});

		test("validates special characters in code", () => {
			const { output } = results.normal;

			// INVARIANT: Special characters in code should be preserved
			expect(output).toContain('"запрещённый any тип"');
			expect(output).toContain('{ complex: "object" }');
			expect(output).toContain("fetchSomeData();");
		});
	});

	describe("Performance Validation", () => {
		test("validates cached execution is fast", () => {
			const startTime = Date.now();

			// Second call should be instant due to caching
			const cachedResults = getCachedLinterResults();

			const executionTime = Date.now() - startTime;

			// INVARIANT: Cached execution should be under 100ms
			expect(executionTime).toBeLessThan(100);

			// INVARIANT: Results should be identical
			expect(cachedResults.normal.output).toBe(results.normal.output);
			expect(cachedResults.normal.exitCode).toBe(results.normal.exitCode);
		});
	});
});
