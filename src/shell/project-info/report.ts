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
import {
	fetchGitInsightEffect,
	type GitCommitInfo,
	type GitInsight,
} from "./git.js";
import { collectGitChangeInfoEffect } from "./git-changes.js";

const numberFormatter = new Intl.NumberFormat("en-US");

/**
 * CHANGE: Deterministic formatting for commit log entries.
 * WHY: Avoid duplicating string templates between local/upstream sections.
 * QUOTE(ТЗ): "Математические инварианты"
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: formatCommitEntry(c) = `git show ${hash} | cat :: ${date} :: ${author} — ${subject}`
 * PURITY: CORE helper
 * INVARIANT: Subject preserved verbatim
 * COMPLEXITY: O(1)
 */
function formatCommitEntry(commit: GitCommitInfo): string {
	return `git show ${commit.shortHash} | cat :: ${commit.date} :: ${commit.author} — ${commit.subject}`;
}

/**
 * CHANGE: Compare commit sequences by hash to detect divergence.
 * WHY: Reporter chooses whether to show one or two timelines.
 * QUOTE(ТЗ): "Математические инварианты"
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: equalCommits(a,b) ⇔ ∀i: hash_a(i) = hash_b(i)
 * PURITY: CORE helper
 * INVARIANT: Symmetric, reflexive
 * COMPLEXITY: O(n)
 */
function commitSequencesEqual(
	left: readonly GitCommitInfo[],
	right: readonly GitCommitInfo[],
): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		const leftHash = left[index]?.shortHash;
		const rightHash = right[index]?.shortHash;
		if (leftHash !== rightHash) {
			return false;
		}
	}
	return true;
}

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
 * CHANGE: Predicate for presence of commit data.
 * WHY: Keep logRecentCommits cyclomatic complexity under lint threshold.
 * QUOTE(ТЗ): "Математические инварианты"
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREМ: hasAnyCommits(head, upstream) ⇔ |head| > 0 ∨ |upstream| > 0
 * PURITY: CORE helper
 * INVARIANT: Symmetric with respect to arguments
 * COMPLEXITY: O(1)
 */
function hasAnyCommits(
	headCommits: readonly GitCommitInfo[],
	upstreamCommits: readonly GitCommitInfo[],
): boolean {
	return headCommits.length > 0 || upstreamCommits.length > 0;
}

/**
 * CHANGE: Predicate for divergent timelines.
 * WHY: Keeps branching out of logRecentCommits body.
 * QUOTE(ТЗ): "Математические инварианты"
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREМ: hasDistinctHistories(head, upstream) ⇔ |head|>0 ∧ |upstream|>0 ∧ ¬equalCommits
 * PURITY: CORE helper
 * INVARIANT: Returns false if either array empty
 * COMPLEXITY: O(n)
 */
function hasDistinctHistories(
	headCommits: readonly GitCommitInfo[],
	upstreamCommits: readonly GitCommitInfo[],
): boolean {
	if (headCommits.length === 0 || upstreamCommits.length === 0) {
		return false;
	}
	return !commitSequencesEqual(headCommits, upstreamCommits);
}

/**
 * CHANGE: Print recent commits with upstream awareness.
 * WHY: Separate shell concern to keep logGitSection concise and lint-compliant.
 * QUOTE(ТЗ): "CORE никогда не вызывает SHELL"
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREМ: logRecentCommits(status, head, upstream) outputs ≤ 2 timelines
 * PURITY: SHELL
 * EFFECT: Effect<void, never>
 * INVARIANT: Avoids duplicate timelines when histories match
 * COMPLEXITY: O(n) where n = commits inspected
 */
function logRecentCommits(
	status: GitInsight["status"],
	headCommits: readonly GitCommitInfo[],
	upstreamCommits: readonly GitCommitInfo[],
): void {
	console.log("\n🧾 Recent commits (last 5)");
	const headPresent = headCommits.length > 0;
	if (!hasAnyCommits(headCommits, upstreamCommits)) {
		console.log("   • No commit information available");
		return;
	}
	if (!hasDistinctHistories(headCommits, upstreamCommits)) {
		const canonicalCommits = headPresent ? headCommits : upstreamCommits;
		canonicalCommits.forEach((commit) => {
			console.log(`   • ${formatCommitEntry(commit)}`);
		});
		return;
	}
	const aheadLabel = status.aheadBehind ?? "ahead of upstream";
	console.log(`   • Local HEAD commits (${aheadLabel}):`);
	headCommits.forEach((commit) => {
		console.log(`     • ${formatCommitEntry(commit)}`);
	});
	const upstreamLabel = status.upstreamBranch ?? "upstream";
	console.log(`   • ${upstreamLabel} commits:`);
	upstreamCommits.forEach((commit) => {
		console.log(`     • ${formatCommitEntry(commit)}`);
	});
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
	const { status } = insight;
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
	logRecentCommits(status, insight.headCommits, insight.upstreamCommits);
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
function logChangeTree(lines: readonly string[]): void {
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
): Effect.Effect<void> {
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
