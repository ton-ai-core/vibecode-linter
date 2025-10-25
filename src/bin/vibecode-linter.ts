#!/usr/bin/env node

// CHANGE: Thin CLI shell wrapper - single point of process.exit
// WHY: Enforce Functional Core, Imperative Shell. APP returns ExitCode; BIN exits the process.
// QUOTE(ТЗ): "CORE никогда не вызывает SHELL" / "Все эффекты (IO) изолированы в тонкой оболочке"
// REF: Architecture refactoring - removed main.ts indirection
// FORMAT THEOREM: ∀run ∈ App: returns exitCode ∈ {0,1} → process.exit(exitCode) occurs exactly once at shell boundary
// PURITY: SHELL (BIN layer)
// INVARIANT: Single point of termination; no process.exit in APP or CORE
// COMPLEXITY: O(1) time/space (delegates to APP)

import { runLinter } from "../app/runLinter.js";
import { parseCLIArgs } from "../shell/config/index.js";

/**
 * CLI entry point for vibecode-linter.
 *
 * @remarks
 * - @pure false (contains side effects: process termination and console I/O)
 * - @invariant exit code is 0 when no errors/duplicates, otherwise 1
 * - @postcondition process terminates exactly once with ExitCode ∈ {0,1}
 * - @complexity O(1) — orchestration only
 */
void (async (): Promise<void> => {
	try {
		const cliOptions = parseCLIArgs();
		const code = await runLinter(cliOptions);
		// Shell boundary: single process exit
		process.exit(code);
	} catch (error) {
		// Shell boundary: report fatal and exit with failure
		// NOTE: logging remains in shell; APP returns typed results
		console.error("Fatal error:", error);
		process.exit(1);
	}
})();
