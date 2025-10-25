// CHANGE: Create public API entry point for library consumers
// WHY: Enforce FCIS - export only APP orchestration and CORE utilities, hide SHELL internals
// QUOTE(ТЗ): "CORE никогда не вызывает SHELL"; "Functional Core, Imperative Shell"
// REF: Architecture refactoring - proper library API
// PURITY: Re-exports only (meta-module)
// INVARIANT: All exports are either pure functions or typed interfaces
// COMPLEXITY: O(1) - module resolution only

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR (Programmatic Entry Point)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main linter orchestrator for programmatic usage.
 *
 * @example
 * ```typescript
 * import { runLinter } from '@ton-ai-core/vibecode-linter';
 *
 * const exitCode = await runLinter({
 *   targetPath: 'src/',
 *   maxClones: 5,
 *   width: 120,
 *   noFix: false,
 *   noPreflight: false,
 *   fixPeers: false,
 * });
 *
 * if (exitCode === 0) {
 *   console.log('✅ No errors found');
 * }
 * ```
 *
 * @pure false - Orchestrates SHELL effects (linters, git, file I/O)
 * @returns ExitCode (0 = success, 1 = errors found)
 */
export { runLinter } from "./app/runLinter.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CORE TYPES (Immutable Domain Models)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Exit code returned by linter operations.
 *
 * @pure true
 * @invariant ExitCode ∈ {0, 1}
 */
export type { ExitCode } from "./core/models.js";
/**
 * CLI options for configuring linter behavior.
 *
 * @pure true
 */
/**
 * Linter configuration loaded from linter.config.json.
 *
 * @pure true
 */
/**
 * Lint message types from different sources.
 *
 * @pure true
 */
/**
 * Code duplication detection results.
 *
 * @pure true
 */
/**
 * Git diff and blame types.
 *
 * @pure true
 */
export type {
	BiomeMessage,
	CLIOptions,
	DiffSnippet,
	DiffSymbol,
	DuplicateInfo,
	ESLintMessage,
	GitBlameResult,
	GitDiffBlock,
	LinterConfig,
	LintMessage,
	LintMessageWithFile,
	LintResult,
	PriorityLevel,
	SarifReport,
	TypeScriptMessage,
} from "./core/types/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CORE PURE FUNCTIONS (Mathematical Utilities)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute exit code from decision state.
 *
 * @pure true
 * @invariant ∀ state: computeExitCode(state) ∈ {0, 1}
 * @complexity O(1)
 */
export { computeExitCode } from "./core/decision.js";

/**
 * Priority level and grouping utilities for lint messages.
 *
 * @pure true
 * @complexity O(n) where n = |messages|
 */
export {
	getPriorityLevel,
	getPriorityName,
	groupByLevel,
	groupBySections,
	ruleIdOfCore,
} from "./core/format/priority.js";

/**
 * Type guards for discriminating lint message sources.
 *
 * @pure true
 * @complexity O(1)
 */
export {
	isBiomeMessage,
	isESLintMessage,
	isTypeScriptMessage,
} from "./core/types/index.js";
