// CHANGE: Git insight collector for project report
// WHY: Need isolated shell module to query git state without polluting core
// QUOTE(ТЗ): "Все эффекты (IO, сеть, БД) изолированы в тонкой оболочке"
// REF: user-request-project-info
// FORMAT THEOREM: fetchGitInsight() ⇒ status + commits derived from git commands
// PURITY: SHELL
// EFFECT: Effect<GitInsight, never>
// INVARIANT: Never throws; falls back to placeholders outside git repo
// COMPLEXITY: O(1) git invocations

import { Effect } from "effect";

import { execGitStdoutOrNull } from "../git/utils.js";

interface GitStatusSummary {
	readonly branch: string;
	readonly aheadBehind: string | null;
	readonly isRepository: boolean;
	readonly statusLines: ReadonlyArray<string>;
	readonly hasUncommitted: boolean;
}

interface GitCommitInfo {
	readonly shortHash: string;
	readonly date: string;
	readonly subject: string;
	readonly author: string;
}

export interface GitInsight {
	readonly status: GitStatusSummary;
	readonly commits: ReadonlyArray<GitCommitInfo>;
}

const DEFAULT_STATUS: GitStatusSummary = {
	branch: "n/a",
	aheadBehind: null,
	isRepository: false,
	statusLines: [],
	hasUncommitted: false,
};

/**
 * CHANGE: Parse `git status -sb` header into branch/ahead info.
 * WHY: Header encodes upstream tracking data we need to surface.
 * QUOTE(ТЗ): "Типовая безопасность" — избегаем `as`.
 * REF: user-request-project-info
 * FORMAT THEOREM: parseHeader(line) = {branch, aheadBehind}
 * PURITY: CORE helper
 * INVARIANT: branch non-empty fallback
 * COMPLEXITY: O(k)
 */
function parseStatusHeader(line: string | undefined): {
	readonly branch: string;
	readonly aheadBehind: string | null;
} {
	if (line === undefined) {
		return { branch: "unknown", aheadBehind: null };
	}
	const trimmed = line.replace(/^##\s*/, "");
	const bracketMatch = trimmed.match(/\[(.+)\]/u);
	const aheadBehind = bracketMatch === null ? null : (bracketMatch[1] ?? null);
	const branchPart = trimmed.split(" ")[0] ?? trimmed;
	const branch = branchPart.split("...")[0] ?? branchPart;
	return {
		branch: branch.length === 0 ? "unknown" : branch,
		aheadBehind,
	};
}

/**
 * CHANGE: Parse git log record emitted via custom format.
 * WHY: Need deterministic splitting even when subject содержит '|'.
 * QUOTE(ТЗ): "Математические инварианты"
 * REF: user-request-project-info
 * FORMAT THEOREM: parseCommit(line) either null or tuple of four fields
 * PURITY: CORE helper
 * INVARIANT: Strings trimmed
 * COMPLEXITY: O(k)
 */
const FIELD_SEPARATOR = "\u001F";

function parseCommitLine(line: string): GitCommitInfo | null {
	const parts = line.split(FIELD_SEPARATOR);
	if (parts.length < 4) {
		return null;
	}
	const shortHash = parts[0];
	const date = parts[1];
	const subject = parts[2];
	const author = parts[3];
	if (
		shortHash === undefined ||
		date === undefined ||
		subject === undefined ||
		author === undefined
	) {
		return null;
	}
	return {
		shortHash: shortHash.trim(),
		date: date.trim(),
		subject: subject.trim(),
		author: author.trim(),
	};
}

/**
 * CHANGE: Fetch git status summary with graceful fallback.
 * WHY: Must not crash when executed outside git repo.
 * QUOTE(ТЗ): "Ошибки: типизированы в сигнатурах"
 * REF: user-request-project-info
 * FORMAT THEOREM: statusEffect() returns DEFAULT when git unavailable
 * PURITY: SHELL
 * EFFECT: Effect<GitStatusSummary, never>
 * INVARIANT: statusLines excludes header
 * COMPLEXITY: O(1)
 */
function fetchGitStatusEffect(): Effect.Effect<GitStatusSummary, never> {
	return Effect.tryPromise(async () => {
		const raw = (await execGitStdoutOrNull("git status -sb")) ?? "";
		if (raw.length === 0 || raw.startsWith("fatal:")) {
			return DEFAULT_STATUS;
		}
		const lines = raw.split(/\r?\n/u).filter((line) => line.length > 0);
		const header = lines.at(0);
		const rest = lines.slice(1);
		const parsed = parseStatusHeader(header);
		return {
			branch: parsed.branch,
			aheadBehind: parsed.aheadBehind,
			isRepository: true,
			statusLines: rest,
			hasUncommitted: rest.length > 0,
		};
	}).pipe(Effect.catchAll(() => Effect.succeed(DEFAULT_STATUS)));
}

/**
 * CHANGE: Fetch latest git commits.
 * WHY: Project report requires last 5 commits.
 * QUOTE(ТЗ): "Типовая безопасность" — список с четкой структурой.
 * REF: user-request-project-info
 * FORMAT THEOREM: commitsEffect() returns ≤ 5 commits
 * PURITY: SHELL
 * EFFECT: Effect<ReadonlyArray<GitCommitInfo>, never>
 * INVARIANT: Non-null subjects only
 * COMPLEXITY: O(1)
 */
function fetchRecentCommitsEffect(): Effect.Effect<
	ReadonlyArray<GitCommitInfo>,
	never
> {
	return Effect.tryPromise(async () => {
		const raw =
			(await execGitStdoutOrNull(
				'git log -5 --date=short --pretty=format:"%h%x1F%cd%x1F%s%x1F%an"',
			)) ?? "";
		if (raw.length === 0 || raw.startsWith("fatal:")) {
			return [];
		}
		const commits: GitCommitInfo[] = [];
		for (const line of raw.split(/\r?\n/u)) {
			if (line.trim().length === 0) continue;
			const parsed = parseCommitLine(line);
			if (parsed !== null) {
				commits.push(parsed);
			}
		}
		return commits;
	}).pipe(
		Effect.catchAll(() => Effect.succeed<ReadonlyArray<GitCommitInfo>>([])),
	);
}

/**
 * CHANGE: Public Effect that returns git insight (status + commits).
 * WHY: Simplifies orchestration in runLinter shell.
 * QUOTE(ТЗ): "Effect-TS для всех эффектов"
 * REF: user-request-project-info
 * FORMAT THEOREM: fetchGitInsightEffect() = combine(status, commits)
 * PURITY: SHELL
 * EFFECT: Effect<GitInsight, never>
 * INVARIANT: commits.length ≤ 5
 * COMPLEXITY: O(1)
 */
export function fetchGitInsightEffect(): Effect.Effect<GitInsight, never> {
	return Effect.all([fetchGitStatusEffect(), fetchRecentCommitsEffect()], {
		concurrency: "unbounded",
	}).pipe(
		Effect.map(([status, commits]) => ({
			status,
			commits,
		})),
	);
}
