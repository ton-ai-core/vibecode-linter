// CHANGE: Console reporter for project + git insights
// WHY: User requested npm run lint to output git status, commits, tree metrics
// QUOTE(USER): "Вывод текущей информации по проекту... Отображать git status... Отображать последние 5 гиткомитов"
// REF: user-request-project-info
// SOURCE: n/a
// FORMAT THEOREM: ∀target: Effect.run(reportProjectInsightsEffect) prints deterministic sections
// PURITY: SHELL
// EFFECT: Effect<void, never>
// INVARIANT: Does not throw; logging confined to this module
// COMPLEXITY: O(n + g) where n=files scanned, g=git queries

import { Effect } from "effect";

import { formatChangeTree } from "../../core/project/change-tree.js";
import { createProjectSnapshot } from "../../core/project/tree.js";
import type { ProjectAggregateMetrics } from "../../core/types/index.js";
import { path } from "../utils/node-mods.js";
import { collectProjectFilesEffect } from "./collector.js";
import { fetchGitInsightEffect, type GitInsight } from "./git.js";
import { collectGitChangeInfoEffect } from "./git-changes.js";

const numberFormatter = new Intl.NumberFormat("en-US");

/**
 * CHANGE: Format bytes into human-readable units for summary line.
 * WHY: Provide compact overview of project size.
 * QUOTE(ТЗ): "Вывод текущей информации по проекту"
 * REF: user-request-project-info
 * FORMAT THEOREM: summarizeBytes(b) = `${value} unit`
 * PURITY: CORE helper
 * INVARIANT: Returns "0 B" when sizeBytes = 0
 * COMPLEXITY: O(1)
 */
function summarizeBytes(sizeBytes: number): string {
	if (sizeBytes <= 0) return "0 B";
	const tiers = [
		{ unit: "GB", factor: 1024 ** 3 },
		{ unit: "MB", factor: 1024 ** 2 },
		{ unit: "KB", factor: 1024 },
		{ unit: "B", factor: 1 },
	] as const;
	for (const tier of tiers) {
		if (sizeBytes >= tier.factor || tier.unit === "B") {
			const normalized = sizeBytes / tier.factor;
			const precision = normalized >= 10 || tier.unit === "B" ? 0 : 1;
			return `${normalized.toFixed(precision)} ${tier.unit}`;
		}
	}
	return `${sizeBytes} B`;
}

/**
 * CHANGE: Derive label for tree root relative to cwd.
 * WHY: Keep output stable regardless of absolute paths.
 * QUOTE(ТЗ): "Каждая функция — это теорема."
 * REF: user-request-project-info
 * FORMAT THEOREM: rootLabel(target) = relative path or "."
 * PURITY: CORE helper
 * INVARIANT: Never empty string
 * COMPLEXITY: O(k)
 */
function deriveRootLabel(targetPath: string): string {
	const absolute = path.resolve(process.cwd(), targetPath);
	const relative = path.relative(process.cwd(), absolute);
	const normalized = relative.replace(/\\/g, "/");
	if (normalized.length === 0) return ".";
	return normalized;
}

/**
 * CHANGE: Print aggregated metrics section.
 * WHY: Provide "Вывод текущей информации по проекту"
 * QUOTE(USER): "Вывод текущей информации по проекту"
 * REF: user-request-project-info
 * FORMAT THEOREM: logSummary(totals) outputs deterministic lines
 * PURITY: SHELL
 * EFFECT: Effect<void, never>
 * INVARIANT: Values formatted with thousands separators
 * COMPLEXITY: O(1)
 */
function logProjectSummary(
	targetPath: string,
	totals: ProjectAggregateMetrics,
): void {
	console.log("\n📦 Project snapshot");
	console.log(`   • Target: ${targetPath}`);
	console.log(
		`   • Files/Dirs: ${numberFormatter.format(totals.fileCount)} files, ${numberFormatter.format(
			Math.max(totals.directoryCount - 1, 0),
		)} dirs`,
	);
	console.log(
		`   • Lines: ${numberFormatter.format(totals.lines)} | Characters: ${numberFormatter.format(
			totals.characters,
		)} | Functions: ${numberFormatter.format(totals.functions)}`,
	);
	console.log(`   • Total size: ${summarizeBytes(totals.sizeBytes)}`);
}

/**
 * CHANGE: Print git section (status + cleanliness).
 * WHY: User explicitly requested git status + info on uncommitted items.
 * QUOTE(USER): "Отображать git status. Есть ли не закомиченные элементы"
 * REF: user-request-project-info
 * FORMAT THEOREM: logGitSection(status) enumerates branch info & pending files
 * PURITY: SHELL
 * EFFECT: Effect<void, never>
 * INVARIANT: Works even outside git repo (prints fallback)
 * COMPLEXITY: O(k) where k=status lines
 */
function logGitSection(insight: GitInsight): void {
	const status = insight.status;
	console.log("\n🌿 Git status");
	if (!status.isRepository) {
		console.log("   • Not a git repository");
		return;
	}
	console.log(`   • Branch: ${status.branch}`);
	if (status.aheadBehind !== null) {
		console.log(`   • Tracking: ${status.aheadBehind}`);
	}
	const cleanliness = status.hasUncommitted
		? `dirty (${status.statusLines.length} files)`
		: "clean";
	console.log(`   • Working tree: ${cleanliness}`);
	if (status.statusLines.length === 0) {
		console.log("   • No pending changes");
	} else {
		console.log("   • Pending changes:");
		status.statusLines.forEach((line) => {
			console.log(`     ${line}`);
		});
	}
	console.log("\n🧾 Recent commits (last 5)");
	if (insight.commits.length === 0) {
		console.log("   • No commit information available");
		return;
	}
	insight.commits.forEach((commit) => {
		console.log(
			`   • git show ${commit.shortHash} | cat :: ${commit.date} :: ${commit.author} — ${commit.subject}`,
		);
	});
}

/**
 * CHANGE: Print formatted tree with indent.
 * WHY: User asked for tree + metrics per file.
 * QUOTE(USER): "Отображать дерево папки с количество строк/символов..."
 * REF: user-request-project-info
 * FORMAT THEOREM: logTree(lines) outputs each line with indentation prefix
 * PURITY: SHELL
 * EFFECT: Effect<void, never>
 * INVARIANT: Handles empty tree gracefully
 * COMPLEXITY: O(n)
 */
function logChangeTree(lines: ReadonlyArray<string>): void {
	console.log("\n🌳 Git change tree (status + +/- lines)");
	if (lines.length === 0) {
		console.log("   • No files discovered");
		return;
	}
	lines.forEach((line) => {
		console.log(`   ${line}`);
	});
}

/**
 * CHANGE: Public Effect to orchestrate report.
 * WHY: Hook runLinter shell into new reporting requirement.
 * QUOTE(USER): "Я думаю добавить в npm run lint ... вывод текущей информации по проекту"
 * REF: user-request-project-info
 * FORMAT THEOREM: reportProjectInsightsEffect(target) composes filesystem + git data
 * PURITY: SHELL
 * EFFECT: Effect<void, never>
 * INVARIANT: Runs after linting; no impact on exit code
 * COMPLEXITY: O(n + g)
 */
export function reportProjectInsightsEffect(
	targetPath: string,
): Effect.Effect<void, never> {
	return Effect.gen(function* () {
		const rootLabel = deriveRootLabel(targetPath);
		const files = yield* collectProjectFilesEffect(targetPath);
		const snapshot = createProjectSnapshot(rootLabel, files);
		const gitInsight = yield* fetchGitInsightEffect();
		const changeMap = yield* collectGitChangeInfoEffect(targetPath);
		const changeTreeLines = formatChangeTree(snapshot.root, changeMap, {
			maxInlineEntries: 5,
		});
		logProjectSummary(rootLabel, snapshot.totals);
		logGitSection(gitInsight);
		logChangeTree(changeTreeLines);
	});
}
