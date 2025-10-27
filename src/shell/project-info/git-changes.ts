// CHANGE: Git change collector for tree rendering
// WHY: Need per-file status (+/- stats) to build aggregated directory summaries
// QUOTE(USER): "Хочу сделать вот такаое отображение дерева..."
// REF: user-request-project-info-tree
// FORMAT THEOREM: collectGitChangeInfoEffect(target) returns deterministic map filtered to target subtree
// PURITY: SHELL
// EFFECT: Effect<ReadonlyMap<string, FileChangeInfo>, never>
// INVARIANT: Fallback to empty map when git unavailable
// COMPLEXITY: O(n) where n = count of git status entries in subtree

import { Effect } from "effect";

import type { FileChangeInfo } from "../../core/types/index.js";
import { execGitStdoutOrNull } from "../git/utils.js";
import { fs, path } from "../utils/node-mods.js";

const fsPromises = fs.promises;

interface TargetResolution {
	readonly normalizedTarget: string;
	readonly isDirectory: boolean;
}

interface NumstatEntry {
	readonly additions: number;
	readonly deletions: number;
}

type StatusCategory = "modified" | "untracked";

const STATUS_HEADER_PREFIX = "##";

const RENAME_SEPARATOR = "->";

interface PathInfo {
	readonly normalized: string;
	readonly isDirectory: boolean;
}

function normalizePath(input: string): string {
	return input.replace(/\\/g, "/").replace(/^\.\/+/u, "");
}

function splitNonEmptyLines(raw: string): readonly string[] {
	return raw
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function trimQuotes(value: string): string {
	return value.replace(/^"+|"+$/gu, "");
}

async function resolveTargetInfo(
	targetPath: string,
): Promise<TargetResolution> {
	try {
		const absolute = path.resolve(process.cwd(), targetPath);
		const stats = await fsPromises.stat(absolute);
		const relative = path.relative(process.cwd(), absolute);
		return {
			normalizedTarget: normalizePath(relative),
			isDirectory: stats.isDirectory(),
		};
	} catch {
		return {
			normalizedTarget: normalizePath(targetPath),
			isDirectory: true,
		};
	}
}

function createRelativeResolver(
	target: TargetResolution,
): (gitPath: string) => string | null {
	const normalizedTarget = target.normalizedTarget;
	if (!target.isDirectory) {
		const targetFile = normalizedTarget;
		return (gitPath) => {
			const normalized = normalizePath(gitPath);
			if (normalized === targetFile) {
				const baseName = path.posix.basename(normalized);
				return baseName;
			}
			return null;
		};
	}
	if (normalizedTarget.length === 0) {
		return (gitPath) => normalizePath(gitPath);
	}
	const prefix = `${normalizedTarget}/`;
	return (gitPath) => {
		const normalized = normalizePath(gitPath);
		if (normalized === normalizedTarget) {
			return "";
		}
		if (normalized.startsWith(prefix)) {
			return normalized.slice(prefix.length);
		}
		return null;
	};
}

function deriveStatusLabel(code: string): string {
	if (code.length >= 2) {
		const staged = code[0] ?? " ";
		const worktree = code[1] ?? " ";
		if (staged !== " ") return staged;
		if (worktree !== " ") return worktree;
	}
	return code.trim() || "M";
}

function deriveCategory(label: string): StatusCategory {
	return label === "??" ? "untracked" : "modified";
}

function cleanGitPath(pathValue: string): string {
	const trimmed = pathValue.trim();
	const arrowIndex = trimmed.lastIndexOf(RENAME_SEPARATOR);
	if (arrowIndex >= 0) {
		return trimmed.slice(arrowIndex + RENAME_SEPARATOR.length).trim();
	}
	return trimmed;
}

function extractPathInfo(pathValue: string): PathInfo {
	const cleaned = cleanGitPath(pathValue);
	const isDirectory = cleaned.endsWith("/");
	const normalized = isDirectory ? cleaned.replace(/\/+$/u, "") : cleaned;
	return {
		normalized,
		isDirectory,
	};
}

function insertTrackedStatus(
	line: string,
	resolveRelative: (gitPath: string) => string | null,
	map: Map<string, FileChangeInfo>,
): void {
	const match = line.match(/^(..)\s+(.*)$/u);
	if (match === null) return;
	const [, code, rawPath] = match;
	const safeCode = code ?? "";
	const safePath = rawPath ?? "";
	const pathInfo = extractPathInfo(safePath);
	const statusLabel = deriveStatusLabel(safeCode);
	const relative = resolveRelative(pathInfo.normalized);
	if (relative === null || relative.length === 0) return;
	map.set(relative, {
		statusLabel,
		category: deriveCategory(statusLabel),
		additions: 0,
		deletions: 0,
		isDirectory: pathInfo.isDirectory,
	});
}

function parseStatusLines(
	raw: string,
	resolveRelative: (gitPath: string) => string | null,
): Map<string, FileChangeInfo> {
	const map = new Map<string, FileChangeInfo>();
	const lines = splitNonEmptyLines(raw);
	for (const line of lines) {
		if (line.startsWith(STATUS_HEADER_PREFIX)) {
			continue;
		}
		if (line.startsWith("??")) {
			const pathInfo = extractPathInfo(line.slice(2));
			const relative = resolveRelative(pathInfo.normalized);
			if (relative !== null && relative.length > 0) {
				map.set(relative, {
					statusLabel: "??",
					category: "untracked",
					additions: 0,
					deletions: 0,
					isDirectory: pathInfo.isDirectory,
				});
			}
			continue;
		}
		insertTrackedStatus(line, resolveRelative, map);
	}
	return map;
}

function parseNumericStat(value: string | undefined): number {
	if (value === undefined || value === "-") return 0;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function appendNumstatEntry(
	map: Map<string, NumstatEntry>,
	additionsRaw: string | undefined,
	deletionsRaw: string | undefined,
	pathRaw: string | undefined,
	resolveRelative: (gitPath: string) => string | null,
): void {
	const safePath = trimQuotes(pathRaw ?? "");
	const pathInfo = extractPathInfo(safePath);
	if (pathInfo.isDirectory) return;
	const relative = resolveRelative(pathInfo.normalized);
	if (relative === null || relative.length === 0) return;
	const additions = parseNumericStat(additionsRaw);
	const deletions = parseNumericStat(deletionsRaw);
	const previous = map.get(relative);
	if (previous === undefined) {
		map.set(relative, { additions, deletions });
	} else {
		map.set(relative, {
			additions: previous.additions + additions,
			deletions: previous.deletions + deletions,
		});
	}
}

function parseNumstat(
	raw: string,
	resolveRelative: (gitPath: string) => string | null,
): Map<string, NumstatEntry> {
	const map = new Map<string, NumstatEntry>();
	const lines = splitNonEmptyLines(raw);
	for (const line of lines) {
		const parts = line.split(/\t/u);
		if (parts.length < 3) continue;
		const additionsRaw = parts[0];
		const deletionsRaw = parts[1];
		const pathPart = parts[parts.length - 1];
		appendNumstatEntry(
			map,
			additionsRaw,
			deletionsRaw,
			pathPart,
			resolveRelative,
		);
	}
	return map;
}

async function collectNumstatForModes(
	resolveRelative: (gitPath: string) => string | null,
): Promise<Map<string, NumstatEntry>> {
	const combined = new Map<string, NumstatEntry>();
	const commands = ["git diff --numstat", "git diff --cached --numstat"];
	for (const command of commands) {
		const raw = (await execGitStdoutOrNull(command)) ?? "";
		const parsed = parseNumstat(raw, resolveRelative);
		for (const [relative, entry] of parsed) {
			const existing = combined.get(relative);
			if (existing === undefined) {
				combined.set(relative, entry);
			} else {
				combined.set(relative, {
					additions: existing.additions + entry.additions,
					deletions: existing.deletions + entry.deletions,
				});
			}
		}
	}
	return combined;
}

async function collectStatusMap(
	resolveRelative: (gitPath: string) => string | null,
): Promise<Map<string, FileChangeInfo>> {
	const raw = (await execGitStdoutOrNull("git status -sb")) ?? "";
	return parseStatusLines(raw, resolveRelative);
}

function mergeNumstatIntoStatus(
	statusMap: Map<string, FileChangeInfo>,
	numstatMap: Map<string, NumstatEntry>,
): void {
	for (const [relative, entry] of numstatMap) {
		const status = statusMap.get(relative);
		if (
			status === undefined ||
			status.category === "untracked" ||
			status.isDirectory
		) {
			continue;
		}
		statusMap.set(relative, {
			...status,
			additions: entry.additions,
			deletions: entry.deletions,
		});
	}
}

/**
 * Собирает карту изменений git для выбранного таргета.
 */
export function collectGitChangeInfoEffect(
	targetPath: string,
): Effect.Effect<ReadonlyMap<string, FileChangeInfo>, never> {
	return Effect.tryPromise(async () => {
		const targetInfo = await resolveTargetInfo(targetPath);
		const resolveRelative = createRelativeResolver(targetInfo);
		const statusMap = await collectStatusMap(resolveRelative);
		if (statusMap.size === 0) {
			return new Map<string, FileChangeInfo>();
		}
		const numstatMap = await collectNumstatForModes(resolveRelative);
		mergeNumstatIntoStatus(statusMap, numstatMap);
		return statusMap;
	}).pipe(
		Effect.catchAll(() => Effect.succeed(new Map<string, FileChangeInfo>())),
	);
}
