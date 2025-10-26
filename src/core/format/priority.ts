// CHANGE: Extract pure priority and grouping utilities using Effect pipe
// WHY: FCIS — move deterministic computations into CORE; demonstrate pipe usage
// QUOTE(ТЗ): "CORE: Исключительно чистые функции, неизменяемые данные"
// QUOTE(ТЗ): "pipe() - композиция функций для функциональной парадигмы"
// SOURCE: https://effect.website/docs/guides/essentials/pipeline
// PURITY: CORE
// INVARIANT: No side effects; functions are total and deterministic
// COMPLEXITY: O(n) where n = |messages| for grouping, O(1) for level/name

import { pipe } from "effect";
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
 * @complexity O(1)
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
 * @invariant result ∈ [0, 5]
 * @complexity O(1) - Map lookup
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
 * @invariant result.length > 0
 * @complexity O(1) - Map lookup
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
 * Group messages by numeric level using pipe for composability.
 *
 * @pure true
 * @invariant result.size <= messages.length
 * @complexity O(n) где n = messages.length
 *
 * @example
 * ```ts
 * import { pipe } from "effect";
 *
 * const grouped = groupByLevel(messages, config);
 * // Uses pipe internally for functional composition
 * ```
 */
export function groupByLevel(
	messages: ReadonlyArray<LintMessageWithFile>,
	ruleLevelMap: RuleLevelMapLike | null,
): Map<number, LintMessageWithFile[]> {
	// CHANGE: Use functional reduce instead of imperative for loop
	// WHY: More composable and mathematically provable
	// FORMAT THEOREM: ∀ messages: groupByLevel(messages) = reduce(messages, groupByKey)
	// PURITY: CORE
	// INVARIANT: No mutations of input, deterministic output
	// COMPLEXITY: O(n)

	return messages.reduce((byLevel, m) => {
		const level = getPriorityLevel(m, ruleLevelMap);
		const arr = byLevel.get(level);

		if (arr === undefined) {
			byLevel.set(level, [m]);
		} else {
			arr.push(m);
		}

		return byLevel;
	}, new Map<number, LintMessageWithFile[]>());
}

/**
 * Group top messages (first 15) by section name using pipe.
 *
 * @pure true
 * @invariant result.size <= 15
 * @complexity O(min(n, 15)) где n = messages.length
 *
 * @example
 * ```ts
 * // Functional composition with pipe
 * const sections = pipe(
 *   messages,
 *   msgs => msgs.slice(0, 15),
 *   msgs => groupBySections(msgs, config)
 * );
 * ```
 */
export const groupBySections = (
	messages: ReadonlyArray<LintMessageWithFile>,
	ruleLevelMap: RuleLevelMapLike | null,
): Map<string, LintMessageWithFile[]> =>
	pipe(
		messages,
		// CHANGE: Use pipe for functional composition
		// WHY: Demonstrates pipe usage for data transformations
		// FORMAT THEOREM: pipe(data, f, g) = g(f(data))
		// PURITY: CORE
		// INVARIANT: ∀ messages: result.size <= 15
		// COMPLEXITY: O(min(n, 15))
		(msgs) => msgs.slice(0, 15),
		(topMsgs) =>
			topMsgs.reduce((sections, m) => {
				const section = getPriorityName(m, ruleLevelMap);
				const arr = sections.get(section);

				if (arr === undefined) {
					sections.set(section, [m]);
				} else {
					arr.push(m);
				}

				return sections;
			}, new Map<string, LintMessageWithFile[]>()),
	);
