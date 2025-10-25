// CHANGE: Introduce typed domain error ADT for Functional Core
// WHY: Replace untyped exceptions with explicit, typed error variants
// QUOTE(ТЗ): "Ошибки: типизированы в сигнатурах функций, не runtime exceptions"
// REF: Architecture plan (FCIS, typed errors)
// PURITY: CORE
// INVARIANT: Errors are values (no throw), discriminated by `_tag`
// COMPLEXITY: O(1)

/**
 * Discriminated union of all typed application errors.
 *
 * @remarks
 * - @pure true
 * - @invariant All variants carry minimal, immutable diagnostic data
 * - @throws Never — this is a pure type; use as return values (Either/Effect) instead of throwing
 */
export type AppError =
	| {
			readonly _tag: "PreflightFailed";
			readonly issues: ReadonlyArray<string>;
	  }
	| {
			readonly _tag: "MissingDeps";
			readonly deps: ReadonlyArray<{
				readonly name: string;
				readonly command: string;
			}>;
	  }
	| {
			readonly _tag: "ExternalToolError";
			readonly tool: "eslint" | "biome" | "git" | "tsc" | "jscpd";
			readonly reason: string;
	  }
	| {
			readonly _tag: "InvariantViolation";
			readonly where: string;
			readonly detail: string;
	  }
	| {
			readonly _tag: "ParseError";
			readonly entity: "eslint" | "biome" | "sarif";
			readonly detail: string;
	  }
	| {
			readonly _tag: "FS";
			readonly detail: string;
			readonly path?: string;
	  }
	| {
			readonly _tag: "Exec";
			readonly command: string;
			readonly detail: string;
	  };

// HELPERS: Constructors (pure) — optional, but useful for consistent creation

export const Errors = {
	preflightFailed: (issues: ReadonlyArray<string>): AppError => ({
		_tag: "PreflightFailed",
		issues,
	}),
	missingDeps: (
		deps: ReadonlyArray<{ readonly name: string; readonly command: string }>,
	): AppError => ({
		_tag: "MissingDeps",
		deps,
	}),
	externalToolError: (
		tool: "eslint" | "biome" | "git" | "tsc" | "jscpd",
		reason: string,
	): AppError => ({
		_tag: "ExternalToolError",
		tool,
		reason,
	}),
	invariantViolation: (where: string, detail: string): AppError => ({
		_tag: "InvariantViolation",
		where,
		detail,
	}),
	parseError: (
		entity: "eslint" | "biome" | "sarif",
		detail: string,
	): AppError => ({
		_tag: "ParseError",
		entity,
		detail,
	}),
	fs: (detail: string, path?: string): AppError =>
		path === undefined ? { _tag: "FS", detail } : { _tag: "FS", detail, path },
	exec: (command: string, detail: string): AppError => ({
		_tag: "Exec",
		command,
		detail,
	}),
} as const;
