// CHANGE: Extract pure priority and grouping utilities from shell/output
// WHY: FCIS — move deterministic computations into CORE; SHELL keeps IO (printing, fs, exec)
// QUOTE(ТЗ): "CORE: Исключительно чистые функции, неизменяемые данные"
// PURITY: CORE
// INVARIANT: No side effects; functions are total and deterministic
// COMPLEXITY: O(n) where n = |messages| for grouping, O(1) for level/name

import type { LintMessageWithFile } from "../types/index.js";

/**
 * Structurally-typed interfaces compatible with shell RuleLevelMap.
 * Using structural typing avoids core -> shell dependency.
 */
export interface RuleLevel {
	readonly level: number;
	readonly name: string;
}

export interface RuleLevelMapLike {
	readonly explicitRules: ReadonlyMap<string, RuleLevel>;
	readonly allLevel?: RuleLevel;
}

/**
 * Get rule id from lint message in a pure, cross-source way.
 *
 * @pure true
 * @invariant m.source ∈ {typescript, eslint, biome} (guaranteed by type system)
 */
export function ruleIdOfCore(m: LintMessageWithFile): string {
	// CHANGE: Simplify by leveraging type system guarantees
	// WHY: LintMessageWithFile union type ensures source is always one of three values
	// INVARIANT: ∀ m: LintMessageWithFile. m.source ∈ {typescript, eslint, biome}
	if (m.source === "typescript") return m.code;
	// Type system guarantees m.source is "eslint" or "biome" here
	const ruleId = m.ruleId;
	return typeof ruleId === "string" && ruleId.length > 0 ? ruleId : "unknown";
}

/**
 * Compute numeric priority level for a message using provided mapping.
 *
 * @pure true
 * @default 2 (error) if not mapped
 */
export function getPriorityLevel(
	m: LintMessageWithFile,
	ruleLevelMap: RuleLevelMapLike | null,
): number {
	if (ruleLevelMap === null) return 2;

	const ruleId = ruleIdOfCore(m);
	const explicit = ruleLevelMap.explicitRules.get(ruleId);
	if (explicit !== undefined) return explicit.level;

	const allLevel = ruleLevelMap.allLevel;
	if (allLevel !== undefined) return allLevel.level;

	return 2;
}

/**
 * Compute human-readable priority name for a message using provided mapping.
 *
 * @pure true
 * @default "Critical Compiler Errors" if not mapped
 */
export function getPriorityName(
	m: LintMessageWithFile,
	ruleLevelMap: RuleLevelMapLike | null,
): string {
	if (ruleLevelMap === null) return "Critical Compiler Errors";

	const ruleId = ruleIdOfCore(m);
	const explicit = ruleLevelMap.explicitRules.get(ruleId);
	if (explicit !== undefined) return explicit.name;

	const allLevel = ruleLevelMap.allLevel;
	if (allLevel !== undefined) return allLevel.name;

	return "Critical Compiler Errors";
}

/**
 * Group messages by numeric level.
 *
 * @pure true
 */
export function groupByLevel(
	messages: ReadonlyArray<LintMessageWithFile>,
	ruleLevelMap: RuleLevelMapLike | null,
): Map<number, LintMessageWithFile[]> {
	const byLevel = new Map<number, LintMessageWithFile[]>();
	for (const m of messages) {
		const level = getPriorityLevel(m, ruleLevelMap);
		const arr = byLevel.get(level);
		if (arr === undefined) byLevel.set(level, [m]);
		else arr.push(m);
	}
	return byLevel;
}

/**
 * Group top messages (first 15) by section name.
 *
 * @pure true
 */
export function groupBySections(
	messages: ReadonlyArray<LintMessageWithFile>,
	ruleLevelMap: RuleLevelMapLike | null,
): Map<string, LintMessageWithFile[]> {
	const sections = new Map<string, LintMessageWithFile[]>();
	for (const m of messages.slice(0, 15)) {
		const section = getPriorityName(m, ruleLevelMap);
		const arr = sections.get(section);
		if (arr === undefined) sections.set(section, [m]);
		else arr.push(m);
	}
	return sections;
}
