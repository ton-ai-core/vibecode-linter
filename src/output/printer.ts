// CHANGE: Extracted result printing logic from lint.ts
// WHY: Result processing and output should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: lint.ts lines 1558-1813

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import * as fs from "node:fs";

import {
	buildDependencyEdges,
	buildProgram,
	topologicalSort,
} from "../analysis/index.js";
import {
	makeRuleLevelMap,
	type RuleLevelMap,
	ruleIdOf,
} from "../config/index.js";
import { expandTabs } from "../diff/index.js";
import {
	detectDiffRange,
	getCommitDiffBlocks,
	getGitDiffBlock,
} from "../git/index.js";
import type {
	CLIOptions,
	DiffRangeConfig,
	LinterConfig,
	LintMessageWithFile,
} from "../types/index.js";

function getPriorityLevel(
	m: LintMessageWithFile,
	ruleLevelMap: RuleLevelMap | null,
): number {
	// CHANGE: Support "all" keyword for catch-all rule matching
	// WHY: User wants to define default level for all unspecified rules
	// REF: user-request-all-keyword
	// SOURCE: n/a
	if (!ruleLevelMap) return 2;

	const ruleId = ruleIdOf(m);

	// 1. Check explicit rules first
	const explicitRule = ruleLevelMap.explicitRules.get(ruleId);
	if (explicitRule) {
		return explicitRule.level;
	}

	// 2. Use "all" level if defined
	if (ruleLevelMap.allLevel) {
		return ruleLevelMap.allLevel.level;
	}

	// 3. Fallback to level 2
	return 2;
}

function getPriorityName(
	m: LintMessageWithFile,
	ruleLevelMap: RuleLevelMap | null,
): string {
	if (!ruleLevelMap) return "Critical Compiler Errors";

	const ruleId = ruleIdOf(m);

	// 1. Check explicit rules first
	const explicitRule = ruleLevelMap.explicitRules.get(ruleId);
	if (explicitRule) {
		return explicitRule.name;
	}

	// 2. Use "all" level name if defined
	if (ruleLevelMap.allLevel) {
		return ruleLevelMap.allLevel.name;
	}

	// 3. Fallback
	return "Critical Compiler Errors";
}

/**
 * Обрабатывает и выводит результаты линтинга.
 *
 * @param messages Массив сообщений
 * @param config Конфигурация линтера
 * @param cliOptions Опции CLI
 * @returns True если есть ошибки
 */
export async function processResults(
	messages: ReadonlyArray<LintMessageWithFile>,
	config: LinterConfig | null,
	cliOptions: CLIOptions,
): Promise<boolean> {
	// Sort by dependencies
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

	const ruleLevelMap = config ? makeRuleLevelMap(config) : null;
	const diffRange: DiffRangeConfig =
		sortedMessages.length > 0
			? await detectDiffRange()
			: { diffArg: "HEAD", label: "HEAD" };
	const diffContext = cliOptions.context ?? 3;

	if (sortedMessages.length > 0) {
		const byLevel = new Map<number, typeof sortedMessages>();
		for (const m of sortedMessages) {
			const level = getPriorityLevel(m, ruleLevelMap);
			if (!byLevel.has(level)) byLevel.set(level, []);
			const levelArray = byLevel.get(level);
			if (levelArray) levelArray.push(m);
		}

		const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);
		for (const level of sortedLevels) {
			const levelMessages = byLevel.get(level);
			if (levelMessages && levelMessages.length > 0) {
				const sections = new Map<string, typeof sortedMessages>();
				for (const m of levelMessages.slice(0, 15)) {
					const sectionName = getPriorityName(m, ruleLevelMap);
					if (!sections.has(sectionName)) sections.set(sectionName, []);
					const sectionArray = sections.get(sectionName);
					if (sectionArray) sectionArray.push(m);
				}

				for (const [name, arr] of sections) {
					console.log(`\n=== ${name} (${arr.length} issues) ===`);
					await printMessages(arr, diffRange, diffContext);
				}
				break;
			}
		}
	}

	const errorCount = sortedMessages.filter((m) => m.severity === 2).length;
	const warningCount = sortedMessages.filter((m) => m.severity === 1).length;
	const tsErrorCount = sortedMessages.filter(
		(m) => m.source === "typescript" && m.severity === 2,
	).length;
	const biomeErrorCount = sortedMessages.filter(
		(m) => m.source === "biome" && m.severity === 2,
	).length;
	const eslintErrorCount = sortedMessages.filter(
		(m) => m.source === "eslint" && m.severity === 2,
	).length;

	console.log(
		`\n📊 Total: ${errorCount} errors (${tsErrorCount} TypeScript, ${eslintErrorCount} ESLint, ${biomeErrorCount} Biome), ${warningCount} warnings.`,
	);
	return errorCount > 0;
}

async function printMessages(
	messages: ReadonlyArray<LintMessageWithFile>,
	diffRange: DiffRangeConfig,
	diffContext: number,
): Promise<void> {
	const cache = new Map<string, ReadonlyArray<string>>();

	for (const m of messages) {
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

		const diffBlock = await getGitDiffBlock(m, diffRange, diffContext);
		let printedFromDiff = false;
		if (diffBlock) {
			console.log(diffBlock.heading);
			for (const diffLine of diffBlock.lines) console.log(diffLine);
			console.log(diffBlock.footer);
			printedFromDiff = true;
		}

		if (!cache.has(filePath)) {
			try {
				cache.set(filePath, fs.readFileSync(filePath, "utf8").split("\n"));
			} catch {
				console.log("  (Could not read file for context)");
				continue;
			}
		}
		const lines = cache.get(filePath);
		if (!lines) continue;
		const start = Math.max(line - 3, 0);
		const end = Math.min(line + 2, lines.length);
		const diffLineNumbers = diffBlock
			? new Set(diffBlock.headLineNumbers)
			: new Set<number>();

		for (let i = start; i < end; i += 1) {
			if (printedFromDiff && diffLineNumbers.has(i + 1)) continue;
			const prefix = i === line - 1 ? ">" : " ";
			const num = String(i + 1).padStart(4);
			const currentLine = lines[i] || "";
			const lineContent = ` ${prefix} ${num} | ${currentLine}`;
			console.log(lineContent);

			if (i === line - 1) {
				const prefixLength = ` ${prefix} ${num} | `.length;
				let realColumn = 0;
				let visualColumn = 0;
				const targetVisualColumn = column - 1;

				for (
					let charIndex = 0;
					charIndex <= currentLine.length;
					charIndex += 1
				) {
					if (visualColumn === targetVisualColumn) {
						realColumn = charIndex;
						break;
					}
					if (visualColumn > targetVisualColumn) {
						realColumn = charIndex;
						break;
					}
					if (charIndex >= currentLine.length) {
						realColumn = currentLine.length;
						break;
					}

					const char = currentLine[charIndex];
					if (char === "\t") {
						const tabSize = 8;
						const nextTabStop =
							Math.floor(visualColumn / tabSize + 1) * tabSize;
						visualColumn = nextTabStop;
					} else if (char === "\r") {
						visualColumn += 0;
					} else if (char === "\n") {
						visualColumn += 1;
					} else {
						visualColumn += 1;
					}
				}

				if (visualColumn < targetVisualColumn) realColumn = currentLine.length;
				const startCol = Math.max(0, Math.min(realColumn, currentLine.length));

				let endCol: number;
				if ("endColumn" in m && m.endColumn) {
					endCol = Math.min(m.endColumn - 1, currentLine.length);
				} else if (source === "typescript") {
					const charAtPos = currentLine[startCol];
					if (message.includes("Expected") && message.includes("arguments")) {
						const beforeCursor = currentLine.substring(0, startCol + 15);
						const funcCallMatch = beforeCursor.match(
							/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*$/,
						);
						if (funcCallMatch) {
							const lastCommaPos = beforeCursor.lastIndexOf(",");
							const openParenPos = beforeCursor.lastIndexOf("(");
							const targetPos = Math.max(lastCommaPos, openParenPos);
							if (targetPos !== -1) {
								let newStartCol = targetPos + 1;
								while (newStartCol < currentLine.length) {
									const char = currentLine[newStartCol];
									if (!char || !/\s/.test(char)) break;
									newStartCol += 1;
								}
								endCol = newStartCol + 1;
							} else {
								endCol = startCol + 1;
							}
						} else {
							endCol = startCol + 1;
						}
					} else if (charAtPos && /[a-zA-Z_$]/.test(charAtPos)) {
						const remainingLine = currentLine.substring(startCol);
						const wordMatch = remainingLine.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
						if (wordMatch) {
							endCol = Math.min(
								startCol + wordMatch[0].length,
								currentLine.length,
							);
						} else {
							endCol = startCol + 1;
						}
					} else {
						endCol = startCol + 1;
					}
				} else {
					endCol = startCol + 1;
				}

				const beforeHighlight = " ".repeat(prefixLength + startCol);
				const highlightLength = Math.max(1, endCol - startCol);
				const highlight = "^".repeat(highlightLength);
				console.log(`${beforeHighlight}${highlight}`);
			}
		}

		// CHANGE: Show only commits that modified the target line
		// WHY: git log -L now filters commits, so all blocks have diffSnippet !== null
		// QUOTE(USER): "Можем мы сделать что бы не отображать (no changes in this commit)"
		// REF: user-request-filter-commits-by-line-changes
		// SOURCE: n/a
		const commitDiffBlocks = await getCommitDiffBlocks(
			filePath,
			line,
			3,
			diffContext,
		);

		if (commitDiffBlocks) {
			for (const block of commitDiffBlocks) {
				console.log(`\n    ${block.heading}`);
				// CHANGE: Add Newer/Older prefixes to make commit order clear
				// WHY: Users need to easily distinguish which commit is new and which is old
				// QUOTE(USER): "А мы можем перед ними отображать хеши? Иначе не понятно"
				// REF: user-request-add-newer-older-labels
				// SOURCE: n/a
				console.log(
					`    Newer: ${block.newerCommit.shortHash} (${block.newerCommit.date}) by ${block.newerCommit.author}: ${block.newerCommit.summary}`,
				);
				console.log(
					`    Older: ${block.olderCommit.shortHash} (${block.olderCommit.date}) by ${block.olderCommit.author}: ${block.olderCommit.summary}`,
				);

				if (block.diffSnippet) {
					console.log(`    ${block.diffSnippet.header}`);

					// Find removed (-) and added (+) lines
					const pointerIndex = block.diffSnippet.pointerIndex;
					let startIdx = 0;
					let endIdx = block.diffSnippet.lines.length;

					// If pointer exists, show context around it; otherwise show all
					if (pointerIndex !== null) {
						const contextSize = 3;
						startIdx = Math.max(0, pointerIndex - contextSize);
						endIdx = Math.min(
							block.diffSnippet.lines.length,
							pointerIndex + contextSize + 1,
						);
					}

					const removedLines: (typeof block.diffSnippet.lines)[0][] = [];
					const addedLines: (typeof block.diffSnippet.lines)[0][] = [];
					const contextLines: (typeof block.diffSnippet.lines)[0][] = [];

					for (let i = startIdx; i < endIdx; i += 1) {
						const diffLine = block.diffSnippet.lines[i];
						if (!diffLine) continue;

						if (diffLine.symbol === "-") {
							removedLines.push(diffLine);
						} else if (diffLine.symbol === "+") {
							addedLines.push(diffLine);
						} else if (diffLine.symbol === " ") {
							contextLines.push(diffLine);
						}
					}

					// Show context before changes (2-3 lines)
					const contextBefore = contextLines.slice(0, 3);
					for (const line of contextBefore) {
						const lineNumber =
							line.headLineNumber !== null
								? String(line.headLineNumber).padStart(4)
								: "    ";
						console.log(`      ${lineNumber} | ${expandTabs(line.content, 8)}`);
					}

					// Show removed lines (old code) - up to 5 lines
					if (removedLines.length > 0) {
						for (const line of removedLines.slice(0, 5)) {
							const lineNumber = "    ";
							console.log(
								`    - ${lineNumber} | ${expandTabs(line.content, 8)}`,
							);
						}
						if (removedLines.length > 5) {
							console.log(
								"          ... (see full diff with git command above)",
							);
						}
					}

					// Show added lines (new code) - up to 5 lines
					if (addedLines.length > 0) {
						for (const line of addedLines.slice(0, 5)) {
							const lineNumber =
								line.headLineNumber !== null
									? String(line.headLineNumber).padStart(4)
									: "    ";
							console.log(
								`    + ${lineNumber} | ${expandTabs(line.content, 8)}`,
							);
						}
						if (addedLines.length > 5) {
							console.log(
								"          ... (see full diff with git command above)",
							);
						}
					}

					// Show context after changes (2-3 lines)
					const contextAfter = contextLines.slice(
						contextBefore.length,
						contextBefore.length + 3,
					);
					for (const line of contextAfter) {
						const lineNumber =
							line.headLineNumber !== null
								? String(line.headLineNumber).padStart(4)
								: "    ";
						console.log(`      ${lineNumber} | ${expandTabs(line.content, 8)}`);
					}

					console.log(
						"    ---------------------------------------------------------------",
					);
				}
			}

			const relativePath = filePath.replace(/\\/g, "/");
			console.log(
				`\n    Full list: git log -L ${line},${line}:${relativePath} | cat`,
			);
		} else {
			// CHANGE: Show message when no commits modified the target line
			// WHY: User wants to know if there are no commits changing the line
			// QUOTE(USER): "Если таких комитов нету то написать что комитов изменяющих это место нету"
			// REF: user-request-filter-commits-by-line-changes
			// SOURCE: n/a
			console.log("\n    (no commits changing this line found)");
		}

		if (source === "biome") {
			const biomeRuleId = "ruleId" in m ? m.ruleId : null;
			if (biomeRuleId)
				console.log(
					`   📖 docs: https://biomejs.dev/linter/rules/${biomeRuleId}`,
				);
		}
	}
}
