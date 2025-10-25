// CHANGE: Make main.ts a thin APP delegator
// WHY: Enforce FCIS — main parses CLI options and delegates orchestration to app/runLinter
// QUOTE(ТЗ): "Functional Core, Imperative Shell; CORE never calls SHELL; Dependencies: SHELL → CORE"
// REF: Architecture plan (Iteration 1)
// PURITY: APP (no process.exit; only composition)
// INVARIANT: Returns ExitCode as value without side effects
// COMPLEXITY: O(1)

import { runLinter } from "./app/runLinter.js";
import type { ExitCode } from "./core/models.js";
import { parseCLIArgs } from "./shell/config/index.js";

/**
 * Entry for programmatic usage (without terminating process).
 *
 * @returns ExitCode (0 | 1)
 *
 * @pure false (delegates to app orchestration), but does not call process.exit
 * @invariant ExitCode ∈ {0,1}
 * @complexity O(1)
 */
export async function main(): Promise<ExitCode> {
	const cliOptions = parseCLIArgs();
	return runLinter(cliOptions);
}
