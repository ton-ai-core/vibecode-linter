// CHANGE: Add unit tests for message type guards
// WHY: Achieve 100% coverage for type narrowing utilities
// QUOTE(ТЗ): "Надо дописать тесты что бы было 100% покрытие"
// REF: Coverage requirement for all CORE functions

import { describe, expect, it } from "vitest";
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

describe("type guards for LintMessage variants", () => {
	describe("isTypeScriptMessage", () => {
		it("returns true for TypeScript message", () => {
			expect(isTypeScriptMessage(tsMessage)).toBeTruthy();
		});

		it("returns false for ESLint message", () => {
			expect(isTypeScriptMessage(eslintMessage)).toBeFalsy();
		});

		it("returns false for Biome message", () => {
			expect(isTypeScriptMessage(biomeMessage)).toBeFalsy();
		});
	});

	describe("isESLintMessage", () => {
		it("returns true for ESLint message", () => {
			expect(isESLintMessage(eslintMessage)).toBeTruthy();
		});

		it("returns false for TypeScript message", () => {
			expect(isESLintMessage(tsMessage)).toBeFalsy();
		});

		it("returns false for Biome message", () => {
			expect(isESLintMessage(biomeMessage)).toBeFalsy();
		});
	});

	describe("isBiomeMessage", () => {
		it("returns true for Biome message", () => {
			expect(isBiomeMessage(biomeMessage)).toBeTruthy();
		});

		it("returns false for TypeScript message", () => {
			expect(isBiomeMessage(tsMessage)).toBeFalsy();
		});

		it("returns false for ESLint message", () => {
			expect(isBiomeMessage(eslintMessage)).toBeFalsy();
		});
	});
});
