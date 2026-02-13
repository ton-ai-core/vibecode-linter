// CHANGE: Unit tests for processResults to verify warning/error blocking behavior
// WHY: Ensure warnings (severity 1) block execution alongside errors (severity 2)
// QUOTE(#2): "Если есть warning в коде, его нужно исправить и не позволяет двигаться дальше"
// REF: Issue #2 - Block execution on warnings
// INVARIANT: ∀m ∈ Messages: (m.severity === 1 ∨ m.severity === 2) → hasLintErrors = true
// PURITY: SHELL - tests Effect-based I/O functions with mocked dependencies
// COMPLEXITY: O(n) where n = |messages|

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type {
	CLIOptions,
	ESLintMessage,
} from "../../../src/core/types/index.js";
import { processResults } from "../../../src/shell/output/printer.js";

// CHANGE: Test fixtures extracted to module scope
// WHY: Reduce cognitive load, reuse fixtures across test suites
// INVARIANT: Each fixture represents a valid message with correct severity
// PURITY: CORE - pure factory function
// COMPLEXITY: O(1)
const createESLintMessage = (
	severity: 1 | 2,
	message: string,
): ESLintMessage => ({
	source: "eslint",
	ruleId: "test-rule",
	severity,
	message,
	line: 1,
	column: 1,
	filePath: "/test/file.ts",
});

// CHANGE: Default CLI options for testing
// WHY: processResults requires full CLIOptions, use sensible defaults
// INVARIANT: Minimal valid CLIOptions object
const defaultCliOptions: CLIOptions = {
	targetPath: ".",
	maxClones: 10,
	width: 80,
	context: 3,
	noFix: false,
	noPreflight: false,
	fixPeers: false,
};

// CHANGE: Helper to test processResults blocking behavior
// WHY: DRY principle - eliminate duplicated Effect.gen/runPromise pattern
// INVARIANT: Returns whether hasLintErrors flag is set
// PURITY: SHELL - wraps Effect execution
// COMPLEXITY: O(n) where n = |messages|
// EFFECT: Effect<void, never, never>
const testBlockingBehavior = (
	messages: readonly ESLintMessage[],
	expectedBlocking: boolean,
): ReturnType<typeof Effect.runPromise> =>
	Effect.runPromise(
		Effect.gen(function* (_) {
			const hasErrors = yield* _(
				processResults(messages, null, defaultCliOptions),
			);
			expect(hasErrors).toBe(expectedBlocking);
		}),
	);

describe("processResults - Warning/Error Blocking Behavior", () => {
	describe("with errors (severity === 2)", () => {
		it("returns true to block execution when errors present", () => {
			// CHANGE: Test that errors block execution (existing behavior)
			// WHY: Verify regression - errors must still block execution
			// INVARIANT: hasLintErrors = true when any message.severity === 2
			const messages: readonly ESLintMessage[] = [
				createESLintMessage(2, "Error"),
			];
			return testBlockingBehavior(messages, true);
		});

		it("returns false when no messages", () => {
			// CHANGE: Test that no messages = no blocking
			// WHY: Baseline case - empty results should not block
			// INVARIANT: hasLintErrors = false when |messages| = 0
			const messages: readonly ESLintMessage[] = [];
			return testBlockingBehavior(messages, false);
		});
	});

	describe("with warnings (severity === 1)", () => {
		it("returns true to block execution when warnings present", () => {
			// CHANGE: Test that warnings now block execution (new behavior)
			// WHY: Implement requirement #2 - warnings should block like errors
			// QUOTE(#2): "Если есть warning в коде, его нужно исправить"
			// INVARIANT: hasLintErrors = true when any message.severity === 1
			const messages: readonly ESLintMessage[] = [
				createESLintMessage(1, "Warning"),
			];
			return testBlockingBehavior(messages, true);
		});

		it("blocks execution with multiple warnings", () => {
			// CHANGE: Test accumulation of warnings
			// WHY: Ensure all warnings contribute to blocking decision
			// INVARIANT: hasLintErrors = true when |{m ∈ Messages: m.severity === 1}| > 0
			const messages: readonly ESLintMessage[] = [
				createESLintMessage(1, "Warning 1"),
				createESLintMessage(1, "Warning 2"),
				createESLintMessage(1, "Warning 3"),
			];
			return testBlockingBehavior(messages, true);
		});
	});

	describe("with mixed errors and warnings", () => {
		it("returns true when both errors and warnings present", () => {
			// CHANGE: Test combination of errors and warnings
			// WHY: Both should trigger blocking
			// INVARIANT: hasLintErrors = true when (∃ severity=1 ∨ ∃ severity=2)
			const messages: readonly ESLintMessage[] = [
				createESLintMessage(2, "Error"),
				createESLintMessage(1, "Warning"),
			];
			return testBlockingBehavior(messages, true);
		});

		it("returns true with only warnings when errors absent", () => {
			// CHANGE: Critical test - warnings alone should block
			// WHY: Verify warnings don't get ignored just because no errors exist
			// INVARIANT: (∄ severity=2) ∧ (∃ severity=1) → hasLintErrors = true
			// REF: Issue #2 - validates the fix for blocking on warnings
			const messages: readonly ESLintMessage[] = [
				createESLintMessage(1, "Only warning"),
			];
			return testBlockingBehavior(messages, true);
		});
	});
});
