// CHANGE: Introduce typed domain error ADT for Functional Core using Effect.Data
// WHY: Replace untyped exceptions with explicit, typed error variants compatible with Effect
// QUOTE(ТЗ): "Ошибки: типизированы в сигнатурах функций, не runtime exceptions"
// REF: Architecture plan (FCIS, typed errors), Effect Data API
// SOURCE: https://effect.website/docs/data-types/data
// PURITY: CORE
// INVARIANT: Errors are values (no throw), discriminated by `_tag`
// COMPLEXITY: O(1)

import { Data } from "effect";

/**
 * Preflight check failed - required environment checks not satisfied
 *
 * @pure true (Data class)
 * @invariant issues.length > 0
 * @complexity O(1)
 */
export class PreflightFailed extends Data.TaggedError("PreflightFailed")<{
	readonly issues: readonly string[];
}> {}

/**
 * Missing required dependencies
 *
 * @pure true (Data class)
 * @invariant deps.length > 0
 * @complexity O(1)
 */
export class MissingDeps extends Data.TaggedError("MissingDeps")<{
	readonly deps: readonly {
		readonly name: string;
		readonly command: string;
	}[];
}> {}

/**
 * External tool execution error
 *
 * @pure true (Data class)
 * @invariant reason.length > 0
 * @complexity O(1)
 */
export class ExternalToolError extends Data.TaggedError("ExternalToolError")<{
	readonly tool: "eslint" | "biome" | "git" | "tsc" | "jscpd";
	readonly reason: string;
}> {}

/**
 * Invariant violation - mathematical guarantee broken
 *
 * @pure true (Data class)
 * @invariant where.length > 0 ∧ detail.length > 0
 * @complexity O(1)
 */
export class InvariantViolation extends Data.TaggedError("InvariantViolation")<{
	readonly where: string;
	readonly detail: string;
}> {}

/**
 * Parse error from external tool output
 *
 * @pure true (Data class)
 * @invariant detail.length > 0
 * @complexity O(1)
 */
export class ParseError extends Data.TaggedError("ParseError")<{
	readonly entity: "eslint" | "biome" | "sarif";
	readonly detail: string;
}> {}

/**
 * Filesystem operation error
 *
 * @pure true (Data class)
 * @invariant detail.length > 0
 * @complexity O(1)
 */
export class FSError extends Data.TaggedError("FS")<{
	readonly detail: string;
	readonly path?: string;
}> {}

/**
 * Command execution error
 *
 * @pure true (Data class)
 * @invariant command.length > 0 ∧ detail.length > 0
 * @complexity O(1)
 */
export class ExecError extends Data.TaggedError("Exec")<{
	readonly command: string;
	readonly detail: string;
}> {}

/**
 * Union type of all application errors for Effect signatures
 *
 * @pure true
 * @invariant All errors extend Data.TaggedError
 * @complexity O(1)
 */
export type AppError =
	| PreflightFailed
	| MissingDeps
	| ExternalToolError
	| InvariantViolation
	| ParseError
	| FSError
	| ExecError;
