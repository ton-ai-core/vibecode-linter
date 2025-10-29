// CHANGE: Add unit tests for core/format/priority to enable coverage for CORE
// WHY: Enforce 100% coverage for src/core by importing and exercising pure functions
// NOTE: Split top-level describes to satisfy max-lines-per-function rule

import { describe, expect, it } from "vitest";
import {
	getPriorityLevel,
	getPriorityName,
	groupByLevel,
	groupBySections,
	type RuleLevelMapLike,
	ruleIdOfCore,
} from "../../../src/core/format/priority.js";
import { biomeMsg, eslintMsg, tsMsg } from "../../utils/builders.js";

const mapLike = (
	explicit: Record<string, { level: number; name: string }>,
	all?: { level: number; name: string },
): RuleLevelMapLike => {
	const explicitRules = new Map<string, { level: number; name: string }>(
		Object.entries(explicit).map(([k, v]) => [
			k,
			{ level: v.level, name: v.name },
		]),
	);
	return all
		? { explicitRules, allLevel: { level: all.level, name: all.name } }
		: { explicitRules };
};

describe("ruleIdOfCore", () => {
	it("returns TypeScript code for TS messages", () => {
		expect(ruleIdOfCore(tsMsg({ code: "TS9999" }))).toBe("TS9999");
	});

	it("returns ruleId for eslint/biome messages", () => {
		expect(ruleIdOfCore(eslintMsg({ ruleId: "x/y" }))).toBe("x/y");
		expect(ruleIdOfCore(biomeMsg({ ruleId: "a/b" }))).toBe("a/b");
	});

	it("returns 'unknown' when ruleId is missing or empty", () => {
		expect(ruleIdOfCore(eslintMsg({ ruleId: "" }))).toBe("unknown");
		expect(ruleIdOfCore(biomeMsg({ ruleId: "" }))).toBe("unknown");
	});
});

describe("getPriorityLevel", () => {
	it("falls back to 2 when map is null or no matching rules", () => {
		expect(getPriorityLevel(eslintMsg({ ruleId: "nope" }), null)).toBe(2);
		const ml = mapLike({});
		expect(getPriorityLevel(eslintMsg({ ruleId: "nope" }), ml)).toBe(2);
	});

	it("uses explicit rule mapping when present", () => {
		const ml = mapLike({ "eslint/rule": { level: 1, name: "Lint" } });
		expect(getPriorityLevel(eslintMsg({ ruleId: "eslint/rule" }), ml)).toBe(1);
	});

	it("uses allLevel when explicit not found", () => {
		const ml = mapLike({}, { level: 0, name: "All" });
		expect(getPriorityLevel(eslintMsg({ ruleId: "other" }), ml)).toBe(0);
	});
});

describe("getPriorityName", () => {
	it("falls back to default name when map is null or no matching rules", () => {
		expect(getPriorityName(eslintMsg({ ruleId: "nope" }), null)).toBe(
			"Critical Compiler Errors",
		);
		const ml = mapLike({});
		expect(getPriorityName(eslintMsg({ ruleId: "nope" }), ml)).toBe(
			"Critical Compiler Errors",
		);
	});

	it("uses explicit rule name when present", () => {
		const ml = mapLike({ "biome/rule": { level: 1, name: "BiomeSec" } });
		expect(getPriorityName(biomeMsg({ ruleId: "biome/rule" }), ml)).toBe(
			"BiomeSec",
		);
	});

	it("uses allLevel name when explicit not found", () => {
		const ml = mapLike({}, { level: 0, name: "All" });
		expect(getPriorityName(eslintMsg({ ruleId: "other" }), ml)).toBe("All");
	});
});

describe("groupByLevel", () => {
	it("groups by numeric level", () => {
		const ml = mapLike(
			{ "eslint/rule": { level: 1, name: "L" } },
			{ level: 2, name: "ALL" },
		);
		const msgs = [eslintMsg(), biomeMsg({ ruleId: "other" })];
		const grouped = groupByLevel(msgs, ml);
		expect(grouped.get(1)?.length).toBe(1);
		expect(grouped.get(2)?.length).toBe(1);
	});

	// CHANGE: Add test for multiple messages with same priority level
	// WHY: Cover branch where arr.push(m) is called (priority.ts:93)
	// INVARIANT: ∀ level ∈ Levels: |grouped[level]| = count(msgs, level)
	// PURITY: CORE
	it("handles multiple messages with same level (else branch)", () => {
		const ml = mapLike({}, { level: 1, name: "All" });
		const msgs = [
			eslintMsg({ ruleId: "a" }),
			eslintMsg({ ruleId: "b" }),
			eslintMsg({ ruleId: "c" }),
		];
		const grouped = groupByLevel(msgs, ml);
		expect(grouped.get(1)?.length).toBe(3);
	});
});

describe("groupBySections", () => {
	it("groups sections by name for top 15 messages", () => {
		const ml = mapLike(
			{ "eslint/rule": { level: 1, name: "EslintSec" } },
			{ level: 2, name: "AllSec" },
		);
		const msgs = [
			eslintMsg(),
			biomeMsg({ ruleId: "x" }),
			tsMsg({ code: "TS1" }),
			tsMsg({ code: "TS2" }),
		];
		const sections = groupBySections(msgs, ml);
		expect(sections.get("EslintSec")?.length).toBe(1);
		expect(sections.get("AllSec")?.length).toBeGreaterThanOrEqual(1);
	});
});
