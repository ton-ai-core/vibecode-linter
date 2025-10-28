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
	readonly upstreamBranch: string | null;
	readonly aheadBehind: string | null;
	readonly isRepository: boolean;
	readonly statusLines: readonly string[];
	readonly hasUncommitted: boolean;
}

export interface GitCommitInfo {
	readonly shortHash: string;
	readonly date: string;
	readonly subject: string;
	readonly author: string;
}

export interface GitInsight {
	readonly status: GitStatusSummary;
	readonly headCommits: readonly GitCommitInfo[];
	readonly upstreamCommits: readonly GitCommitInfo[];
}

const DEFAULT_STATUS: GitStatusSummary = {
	branch: "n/a",
	upstreamBranch: null,
	aheadBehind: null,
	isRepository: false,
	statusLines: [],
	hasUncommitted: false,
};

/**
 * CHANGE: Extract `[ahead/behind]` payload from git status header.
 * WHY: Reduce branching in parseStatusHeader to satisfy complexity limit.
 * QUOTE(ТЗ): "Каждая функция — это теорема."
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: extractTracking("main [ahead 1]") = "ahead 1"
 * PURITY: CORE helper
 * INVARIANT: Returns null when brackets absent
 * COMPLEXITY: O(k)
 */
function extractTrackingSegment(header: string): string | null {
	const bracketMatch = header.match(/\[(.+)\]/u);
	return bracketMatch === null ? null : (bracketMatch[1] ?? null);
}

/**
 * CHANGE: Normalize branch name with fallback.
 * WHY: Isolate conditional logic to keep parseStatusHeader simple.
 * QUOTE(ТЗ): "Типовая безопасность" — избегаем `any`.
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: normalizeBranch("") = "unknown"
 * PURITY: CORE helper
 * INVARIANT: Non-empty string result
 * COMPLEXITY: O(1)
 */
function normalizeBranchName(candidate: string | undefined): string {
	if (typeof candidate !== "string" || candidate.length === 0) {
		return "unknown";
	}
	return candidate;
}

/**
 * CHANGE: Normalize upstream branch token.
 * WHY: Centralize null/empty checks for parseStatusHeader.
 * QUOTE(ТЗ): "Типовая безопасность" — все значения строго типизированы.
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREМ: normalizeUpstream(null) = null
 * PURITY: CORE helper
 * INVARIANT: Returns null for empty tokens
 * COMPLEXITY: O(1)
 */
function normalizeUpstreamBranch(
	candidate: string | undefined | null,
): string | null {
	if (typeof candidate !== "string") {
		return null;
	}
	return candidate.length > 0 ? candidate : null;
}

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
	readonly upstreamBranch: string | null;
	readonly aheadBehind: string | null;
} {
	if (line === undefined) {
		return { branch: "unknown", upstreamBranch: null, aheadBehind: null };
	}
	const trimmed = line.replace(/^##\s*/, "");
	const aheadBehind = extractTrackingSegment(trimmed);
	const branchPart = trimmed.split(" ")[0] ?? trimmed;
	const branchSegments = branchPart.split("...");
	const branch = normalizeBranchName(branchSegments[0]);
	const upstreamBranch = normalizeUpstreamBranch(branchSegments[1] ?? null);
	return {
		branch,
		upstreamBranch,
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
	return Effect.gen(function* (_) {
		const rawResult = yield* _(execGitStdoutOrNull("git status -sb"));
		const raw = rawResult ?? "";
		if (raw.length === 0 || raw.startsWith("fatal:")) {
			return DEFAULT_STATUS;
		}
		const lines = raw.split(/\r?\n/u).filter((line: string) => line.length > 0);
		const header = lines.at(0);
		const rest = lines.slice(1);
		const parsed = parseStatusHeader(header);
		return {
			branch: parsed.branch,
			upstreamBranch: parsed.upstreamBranch,
			aheadBehind: parsed.aheadBehind,
			isRepository: true,
			statusLines: rest,
			hasUncommitted: rest.length > 0,
		};
	}).pipe(Effect.catchAll(() => Effect.succeed(DEFAULT_STATUS)));
}

/**
 * CHANGE: Fetch recent commits for targeted refs (HEAD, upstream).
 * WHY: Report must differentiate local-only commits from upstream history.
 * QUOTE(ТЗ): "Типовая безопасность" — список с четкой структурой.
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: commitsEffect(ref) returns ≤ 5 commits, empty when ref invalid
 * PURITY: SHELL
 * EFFECT: Effect<ReadonlyArray<GitCommitInfo>, never>
 * INVARIANT: Non-null subjects only
 * COMPLEXITY: O(1)
 */
// CHANGE: Sanitize git ref for recent commit queries.
// WHY: Prevent shell injection by restricting allowed characters from git status header.
// QUOTE(ТЗ): "Типовая безопасность" — безобидные эффекты требуют чистой обработки данных.
// REF: user-request-project-info
// SOURCE: n/a
// FORMAT THEOREM: sanitizeGitRef(ref) = trimmed ref | null when invalid
// PURITY: CORE helper
// INVARIANT: Returns null for empty or disallowed refs
// COMPLEXITY: O(k)
function sanitizeGitRef(ref: string | null): string | null {
	if (ref === null) {
		return null;
	}
	const trimmed = ref.trim();
	if (trimmed.length === 0) {
		return null;
	}
	const isAllowed = /^[\w./@:{}-]+$/u.test(trimmed);
	return isAllowed ? trimmed : null;
}

function fetchRecentCommitsEffect(
	targetRef: string | null,
): Effect.Effect<readonly GitCommitInfo[], never> {
	const ref = sanitizeGitRef(targetRef);
	if (ref === null) {
		return Effect.succeed<readonly GitCommitInfo[]>([]);
	}
	return Effect.gen(function* (_) {
		const rawResult = yield* _(
			execGitStdoutOrNull(
				`git log -5 --date=short --pretty=format:"%h%x1F%cd%x1F%s%x1F%an" ${ref}`,
			),
		);
		const raw = rawResult ?? "";
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
	}).pipe(Effect.catchAll(() => Effect.succeed<readonly GitCommitInfo[]>([])));
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
	return Effect.gen(function* (_) {
		const status = yield* _(fetchGitStatusEffect());
		if (!status.isRepository) {
			return {
				status,
				headCommits: [],
				upstreamCommits: [],
			};
		}
		const headCommits = yield* _(fetchRecentCommitsEffect("HEAD"));
		const upstreamCommits = yield* _(
			fetchRecentCommitsEffect(status.upstreamBranch),
		);
		return {
			status,
			headCommits,
			upstreamCommits,
		};
	});
}
