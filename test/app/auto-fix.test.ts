// CHANGE: Add unit tests for auto-fix module extracted from runLinter.ts
// WHY: Verify behavioral parity after refactor; lock in Effect-based composition
// QUOTE(ТЗ): "Для библиотеки тестов я использую vitest"
// REF: Architecture plan - module-level unit tests
// PURITY: test (no SHELL effects; linter fns are mocked)

import { describe, expect, it, vi } from "vitest";

import { maybeRunAutoFixEffect } from "../../src/app/auto-fix.js";

vi.mock("../../src/shell/linters/index.js", () => ({
	runESLintFix: vi.fn(),
	runBiomeFix: vi.fn(),
}));

import { runBiomeFix, runESLintFix } from "../../src/shell/linters/index.js";
import { Effect } from "effect";

describe("maybeRunAutoFixEffect", () => {
	it("skips auto-fix when noFix is true", async () => {
		const result = await Effect.runPromise(
			maybeRunAutoFixEffect("/some/path", true, "pnpm"),
		);
		expect(result).toBeUndefined();
		expect(runESLintFix).not.toHaveBeenCalled();
		expect(runBiomeFix).not.toHaveBeenCalled();
	});

	it("runs both fixers when noFix is false", async () => {
		vi.mocked(runESLintFix).mockReturnValue(Effect.succeed(undefined));
		vi.mocked(runBiomeFix).mockReturnValue(Effect.succeed(undefined));

		const result = await Effect.runPromise(
			maybeRunAutoFixEffect("/some/path", false, "pnpm"),
		);

		expect(result).toBeUndefined();
		expect(runESLintFix).toHaveBeenCalledWith("/some/path", "pnpm");
		expect(runBiomeFix).toHaveBeenCalledWith("/some/path", "pnpm");
	});

	it("continues when ESLint fix fails", async () => {
		vi.mocked(runESLintFix).mockReturnValue(
			Effect.fail(new Error("eslint failed") as never),
		);
		vi.mocked(runBiomeFix).mockReturnValue(Effect.succeed(undefined));

		const result = await Effect.runPromise(
			maybeRunAutoFixEffect("/some/path", false, "npm"),
		);

		expect(result).toBeUndefined();
		expect(runBiomeFix).toHaveBeenCalled();
	});
});
