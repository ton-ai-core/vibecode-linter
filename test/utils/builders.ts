// CHANGE: Centralize test message builders to avoid duplication across tests
// WHY: jscpd flagged duplicate helper code in tests; builders are pure and reusable

import type { LintMessageWithFile } from "../../src/core/types/index.js";

/** Build a TypeScript lint message with sensible defaults. */
export const tsMsg = (
	over: Partial<LintMessageWithFile> = {},
): LintMessageWithFile =>
	({
		source: "typescript",
		code: "TS0000",
		severity: 2,
		message: "message",
		line: 1,
		column: 1,
		filePath: "/tmp/file.ts",
		...over,
	}) as LintMessageWithFile;

/** Build an ESLint lint message with sensible defaults. */
export const eslintMsg = (
	over: Partial<LintMessageWithFile> = {},
): LintMessageWithFile =>
	({
		source: "eslint",
		ruleId: "eslint/rule",
		severity: 1,
		message: "eslint",
		line: 1,
		column: 1,
		filePath: "/tmp/file.ts",
		...over,
	}) as LintMessageWithFile;

/** Build a Biome lint message with sensible defaults. */
export const biomeMsg = (
	over: Partial<LintMessageWithFile> = {},
): LintMessageWithFile =>
	({
		source: "biome",
		ruleId: "biome/rule",
		severity: 2,
		message: "biome",
		line: 1,
		column: 1,
		filePath: "/tmp/file.ts",
		...over,
	}) as LintMessageWithFile;
