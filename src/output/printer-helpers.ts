// CHANGE: Extracted printer helper functions
// WHY: Reduces line count and complexity of printer.ts
// REF: ESLint max-lines-per-function, max-lines
import * as fs from "node:fs";

import {
	buildDependencyEdges,
	buildProgram,
	topologicalSort,
} from "../analysis/index";
import { type RuleLevelMap, ruleIdOf } from "../config/index";
import { getCommitDiffBlocks, getGitDiffBlock } from "../git/index";
import type {
	DiffRangeConfig,
	GitDiffBlock,
	LintMessageWithFile,
} from "../types/index";
import { printCommitDiffSnippet, printFileContext } from "./printer-context";

export function getPriorityLevel(
	m: LintMessageWithFile,
	ruleLevelMap: RuleLevelMap | null,
): number {
	if (!ruleLevelMap) return 2;

	const ruleId = ruleIdOf(m);

	const explicitRule = ruleLevelMap.explicitRules.get(ruleId);
	if (explicitRule) {
		return explicitRule.level;
	}

	if (ruleLevelMap.allLevel) {
		return ruleLevelMap.allLevel.level;
	}

	return 2;
}

export function getPriorityName(
	m: LintMessageWithFile,
	ruleLevelMap: RuleLevelMap | null,
): string {
	if (!ruleLevelMap) return "Critical Compiler Errors";

	const ruleId = ruleIdOf(m);

	const explicitRule = ruleLevelMap.explicitRules.get(ruleId);
	if (explicitRule) {
		return explicitRule.name;
	}

	if (ruleLevelMap.allLevel) {
		return ruleLevelMap.allLevel.name;
	}

	return "Critical Compiler Errors";
}

export function sortMessages(
	messages: ReadonlyArray<LintMessageWithFile>,
): LintMessageWithFile[] {
	const program = buildProgram();
	const sortedMessages = [...messages];

	const compareMessages = (
		a: LintMessageWithFile,
		b: LintMessageWithFile,
	): number => {
		if (b.severity - a.severity) return b.severity - a.severity;
		if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
		if (a.line !== b.line) return a.line - b.line;
		return a.column - b.column;
	};

	if (program && sortedMessages.length > 1) {
		const edges = buildDependencyEdges(sortedMessages, program);
		const rank = topologicalSort(sortedMessages, edges);
		sortedMessages.sort((a, b) => {
			const ra =
				rank.get(
					`${a.filePath}:${a.line}:${a.column}:${a.source}:${ruleIdOf(a)}`,
				) ?? 0;
			const rb =
				rank.get(
					`${b.filePath}:${b.line}:${b.column}:${b.source}:${ruleIdOf(b)}`,
				) ?? 0;
			if (ra !== rb) return ra - rb;
			return compareMessages(a, b);
		});
	} else {
		sortedMessages.sort(compareMessages);
	}

	return sortedMessages;
}

export function groupByLevel(
	messages: ReadonlyArray<LintMessageWithFile>,
	ruleLevelMap: RuleLevelMap | null,
): Map<number, LintMessageWithFile[]> {
	const byLevel = new Map<number, LintMessageWithFile[]>();
	for (const m of messages) {
		const level = getPriorityLevel(m, ruleLevelMap);
		if (!byLevel.has(level)) byLevel.set(level, []);
		const levelArray = byLevel.get(level);
		if (levelArray) levelArray.push(m);
	}
	return byLevel;
}

export function groupBySections(
	messages: ReadonlyArray<LintMessageWithFile>,
	ruleLevelMap: RuleLevelMap | null,
): Map<string, LintMessageWithFile[]> {
	const sections = new Map<string, LintMessageWithFile[]>();
	for (const m of messages.slice(0, 15)) {
		const sectionName = getPriorityName(m, ruleLevelMap);
		if (!sections.has(sectionName)) sections.set(sectionName, []);
		const sectionArray = sections.get(sectionName);
		if (sectionArray) sectionArray.push(m);
	}
	return sections;
}

export function printStatistics(
	messages: ReadonlyArray<LintMessageWithFile>,
): void {
	const errorCount = messages.filter((m) => m.severity === 2).length;
	const warningCount = messages.filter((m) => m.severity === 1).length;
	const tsErrorCount = messages.filter(
		(m) => m.source === "typescript" && m.severity === 2,
	).length;
	const biomeErrorCount = messages.filter(
		(m) => m.source === "biome" && m.severity === 2,
	).length;
	const eslintErrorCount = messages.filter(
		(m) => m.source === "eslint" && m.severity === 2,
	).length;

	console.log(
		`\n📊 Total: ${errorCount} errors (${tsErrorCount} TypeScript, ${eslintErrorCount} ESLint, ${biomeErrorCount} Biome), ${warningCount} warnings.`,
	);
}

export function printMessageHeader(m: LintMessageWithFile): void {
	const { filePath, line, column, message, severity, source } = m;
	const sevLabel = severity === 2 ? "[ERROR]" : "[WARN ]";
	const ruleId =
		source === "typescript"
			? m.code
			: "ruleId" in m
				? (m.ruleId ?? "unknown")
				: "unknown";
	const sourceLabel =
		source === "typescript"
			? "(TypeScript)"
			: source === "biome"
				? "(Biome)"
				: "(ESLint)";

	console.log(
		`\n${sevLabel} ${filePath}:${line}:${column} ${ruleId} ${sourceLabel} — ${message}`,
	);
}

export async function printDiffBlock(
	m: LintMessageWithFile,
	diffRange: DiffRangeConfig,
	diffContext: number,
): Promise<GitDiffBlock | null> {
	const diffBlock = await getGitDiffBlock(m, diffRange, diffContext);
	if (diffBlock) {
		console.log(diffBlock.heading);
		for (const diffLine of diffBlock.lines) console.log(diffLine);
		console.log(diffBlock.footer);
	}
	return diffBlock;
}

export function loadFileLines(
	filePath: string,
	cache: Map<string, ReadonlyArray<string>>,
): ReadonlyArray<string> | null {
	if (!cache.has(filePath)) {
		try {
			cache.set(filePath, fs.readFileSync(filePath, "utf8").split("\n"));
		} catch {
			console.log("  (Could not read file for context)");
			return null;
		}
	}
	return cache.get(filePath) ?? null;
}

export async function printMessage(
	m: LintMessageWithFile,
	cache: Map<string, ReadonlyArray<string>>,
	diffRange: DiffRangeConfig,
	diffContext: number,
): Promise<void> {
	printMessageHeader(m);
	const diffBlock = await printDiffBlock(m, diffRange, diffContext);

	const lines = loadFileLines(m.filePath, cache);
	if (lines) {
		printFileContext(m, lines, diffBlock);
	}

	const { filePath, line, source } = m;
	const commitDiffBlocks = await getCommitDiffBlocks(
		filePath,
		line,
		3,
		diffContext,
	);

	if (commitDiffBlocks) {
		for (const block of commitDiffBlocks) {
			console.log(`\n    ${block.heading}`);
			console.log(
				`    Newer: ${block.newerCommit.shortHash} (${block.newerCommit.date}) by ${block.newerCommit.author}: ${block.newerCommit.summary}`,
			);
			console.log(
				`    Older: ${block.olderCommit.shortHash} (${block.olderCommit.date}) by ${block.olderCommit.author}: ${block.olderCommit.summary}`,
			);

			printCommitDiffSnippet(block);
		}

		const relativePath = filePath.replace(/\\/g, "/");
		console.log(
			`\n    Full list: git log -L ${line},${line}:${relativePath} | cat`,
		);
	} else {
		console.log("\n    (no commits changing this line found)");
	}

	if (source === "biome") {
		const biomeRuleId = "ruleId" in m ? m.ruleId : null;
		// CHANGE: Avoid truthiness check on possibly nullable string
		// WHY: strict-boolean-expressions — require explicit nullish/empty handling
		// QUOTE(ТЗ): "Исправить все ошибки линтера"
		// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
		if (typeof biomeRuleId === "string" && biomeRuleId.length > 0) {
			console.log(
				`   📖 docs: https://biomejs.dev/linter/rules/${biomeRuleId}`,
			);
		}
	}
}
