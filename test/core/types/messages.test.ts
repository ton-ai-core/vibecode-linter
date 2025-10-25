// CHANGE: Add unit tests for message type guards
// WHY: Achieve 100% coverage for type narrowing utilities
// QUOTE(ТЗ): "Надо дописать тесты что бы было 100% покрытие"
// REF: Coverage requirement for all CORE functions

import {
	type BiomeMessage,
	type ESLintMessage,
	isBiomeMessage,
	isESLintMessage,
	isTypeScriptMessage,
	type TypeScriptMessage,
} from "../../../src/core/types/messages.js";

// Test fixtures (extracted to keep describe blocks under max-lines-per-function)
const tsMessage: TypeScriptMessage = {
	source: "typescript",
	code: "TS2322",
	severity: 2,
	message: "Type 'string' is not assignable to type 'number'",
	line: 10,
	column: 5,
	filePath: "/test/file.ts",
};

const eslintMessage: ESLintMessage = {
	source: "eslint",
	ruleId: "no-unused-vars",
	severity: 1,
	message: "Variable is never used",
	line: 20,
	column: 3,
	filePath: "/test/file.ts",
};

const biomeMessage: BiomeMessage = {
	source: "biome",
	ruleId: "style/noNonNullAssertion",
	severity: 2,
	message: "Forbidden non-null assertion",
	line: 30,
	column: 12,
	filePath: "/test/file.ts",
};

describe("Type guards for LintMessage variants", () => {
	describe("isTypeScriptMessage", () => {
		it("returns true for TypeScript message", () => {
			expect(isTypeScriptMessage(tsMessage)).toBe(true);
		});

		it("returns false for ESLint message", () => {
			expect(isTypeScriptMessage(eslintMessage)).toBe(false);
		});

		it("returns false for Biome message", () => {
			expect(isTypeScriptMessage(biomeMessage)).toBe(false);
		});
	});

	describe("isESLintMessage", () => {
		it("returns true for ESLint message", () => {
			expect(isESLintMessage(eslintMessage)).toBe(true);
		});

		it("returns false for TypeScript message", () => {
			expect(isESLintMessage(tsMessage)).toBe(false);
		});

		it("returns false for Biome message", () => {
			expect(isESLintMessage(biomeMessage)).toBe(false);
		});
	});

	describe("isBiomeMessage", () => {
		it("returns true for Biome message", () => {
			expect(isBiomeMessage(biomeMessage)).toBe(true);
		});

		it("returns false for TypeScript message", () => {
			expect(isBiomeMessage(tsMessage)).toBe(false);
		});

		it("returns false for ESLint message", () => {
			expect(isBiomeMessage(eslintMessage)).toBe(false);
		});
	});
});
