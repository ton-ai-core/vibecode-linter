// CHANGE: Add unit tests for collect-lint-messages module extracted from runLinter.ts
// WHY: Verify parallel linter collection flattens messages correctly
// QUOTE(ТЗ): "Для библиотеки тестов я использую vitest"
// REF: Architecture plan - module-level unit tests
// PURITY: test (mocks SHELL linters)

import { describe, expect, it, vi } from "vitest";

import { collectLintMessagesEffect } from "../../src/app/collect-lint-messages.js";
import { Effect } from "effect";

vi.mock("../../src/shell/linters/index.js", () => ({
	getESLintResults: vi.fn(),
	getBiomeDiagnostics: vi.fn(),
	getTypeScriptDiagnostics: vi.fn(),
}));

import {
	getBiomeDiagnostics,
	getESLintResults,
	getTypeScriptDiagnostics,
} from "../../src/shell/linters/index.js";

describe("collectLintMessagesEffect", () => {
	it("aggregates messages from all three linters with proper source tags", async () => {
		vi.mocked(getESLintResults).mockReturnValue(
			Effect.succeed([
				{
					filePath: "a.ts",
					messages: [{ ruleId: "no-var", severity: 2, message: "no var" }],
				},
			]),
		);
		vi.mocked(getBiomeDiagnostics).mockReturnValue(
			Effect.succeed([
				{
					filePath: "b.ts",
					messages: [{ ruleId: "complexity", severity: 1, message: "complex" }],
				},
			]),
		);
		vi.mocked(getTypeScriptDiagnostics).mockReturnValue(
			Effect.succeed([
				{ filePath: "c.ts", ruleId: "TS2322", severity: 1, message: "type err" },
			]),
		);

		const result = await Effect.runPromise(
			collectLintMessagesEffect("/some/path", "pnpm"),
		);

		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({ source: "eslint", filePath: "a.ts" });
		expect(result[1]).toMatchObject({ source: "biome", filePath: "b.ts" });
		expect(result[2]).toMatchObject({ source: "typescript", filePath: "c.ts" });
	});

	it("returns empty array when all linters return empty", async () => {
		vi.mocked(getESLintResults).mockReturnValue(Effect.succeed([]));
		vi.mocked(getBiomeDiagnostics).mockReturnValue(Effect.succeed([]));
		vi.mocked(getTypeScriptDiagnostics).mockReturnValue(Effect.succeed([]));

		const result = await Effect.runPromise(
			collectLintMessagesEffect("/some/path", "pnpm"),
		);

		expect(result).toEqual([]);
	});

	it("recovers from individual linter failures via catchAll", async () => {
		vi.mocked(getESLintResults).mockReturnValue(
			Effect.fail(new Error("eslint crashed") as never),
		);
		vi.mocked(getBiomeDiagnostics).mockReturnValue(
			Effect.succeed([
				{
					filePath: "x.ts",
					messages: [{ ruleId: "r", severity: 1, message: "m" }],
				},
			]),
		);
		vi.mocked(getTypeScriptDiagnostics).mockReturnValue(Effect.succeed([]));

		const result = await Effect.runPromise(
			collectLintMessagesEffect("/some/path", "pnpm"),
		);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ source: "biome" });
	});
});
