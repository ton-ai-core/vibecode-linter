// CHANGE: Use shared makeResolvePackageManagerParams from core/utils
// WHY: Eliminate duplication (DRY); single source of truth in CORE
// QUOTE(ТЗ): "FUNCTIONAL CORE, IMPERATIVE SHELL"
// REF: Architecture plan - shared helpers in core
// PURITY: SHELL-adjacent (reads environment, console output, executes checks)
// EFFECT: preflight sync; haveCliDependencies is Effect.Effect
// INVARIANT: preflight returns boolean; haveCliDependencies returns Effect<boolean>
// COMPLEXITY: O(1) for preflight; O(1) for haveCliDependencies (delegates to checks)

import { Effect } from "effect";

import { makeResolvePackageManagerParams } from "../core/utils/package-manager-params.js";
import type { CLIOptions, PackageManager } from "../core/types/index.js";
import { checkAndReportPreflight } from "../shell/analysis/preflight.js";
import {
	checkDependencies,
	reportMissingDependencies,
} from "../shell/utils/dependencies.js";
import {
	formatInstallDevCommand,
	resolvePackageManager,
} from "../shell/utils/package-manager.js";

/**
 * Preflight validation. Returns boolean success instead of terminating.
 *
 * CHANGE: Cache process.cwd() in const to avoid repeated calls
 * WHY: process.cwd() is a syscall; read once and reuse
 *
 * @pure false (reads environment, console output)
 */
export function preflightOk(cliOptions: CLIOptions): boolean {
	if (cliOptions.noPreflight) return true;
	const cwd = process.cwd();
	const pre = checkAndReportPreflight(cwd, cliOptions.packageManager);
	if (!pre.ok) {
		if (cliOptions.fixPeers) {
			const { packageManager } = resolvePackageManager(
				makeResolvePackageManagerParams(cwd, cliOptions.packageManager),
			);
			const needsTs = pre.issues.includes("missingTypescript");
			const needsBiome = pre.issues.includes("missingBiome");
			const pkgs: string[] = [];
			if (needsTs) pkgs.push("typescript");
			if (needsBiome) pkgs.push("@biomejs/biome");
			if (pkgs.length > 0) {
				console.error("Suggested install command:");
				console.error(`  ${formatInstallDevCommand(packageManager, pkgs)}`);
			}
		}
		return false;
	}
	return true;
}

/**
 * Ensure required CLI dependencies are present. Returns boolean success.
 *
 * @pure false (executes checks, console output)
 */
export function haveCliDependencies(params: {
	readonly cwd: string;
	readonly packageManager: PackageManager;
}): Effect.Effect<boolean> {
	return Effect.gen(function* (_) {
		const depCheck = yield* _(checkDependencies(params.cwd));
		if (!depCheck.allAvailable) {
			reportMissingDependencies({
				cwd: params.cwd,
				packageManager: params.packageManager,
				missing: depCheck.missing,
			});
			return false;
		}
		return true;
	});
}
