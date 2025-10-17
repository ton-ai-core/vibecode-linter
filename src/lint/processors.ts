// CHANGE: Processing and output module
// WHY: Extract processing logic from lint.ts  
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-PROC-001
// SOURCE: lint.ts processing functions

import * as fs from "fs";
import * as path from "path";
import ruleDocs from "eslint-rule-docs";

import type { LintMessage, TypeScriptMessage, ESLintMessage, BiomeMessage, CLIOptions, DiffRangeConfig } from './types.js';
import { ruleIdOf } from './config.js';
import { buildProgram, buildEdges, topoRank } from './dependency-analysis.js';
import { getGitDiffBlock, getGitBlameBlock, getGitHistoryBlock, visualColumnAt } from './git-advanced.js';
import { getWorkspaceSnippet } from './git.js';
import { expandTabs } from './diff-parser.js';

const TAB_WIDTH = 8;

export const filterMessagesByPath = (
  messages: TypeScriptMessage[],
  targetPath: string,
): TypeScriptMessage[] => {
  if (targetPath === ".") {
    return messages;
  }

  if (targetPath.endsWith(".ts") || targetPath.endsWith(".tsx")) {
    const resolvedTarget = path.resolve(targetPath);
    return messages.filter((msg) => {
      const resolvedFile = path.resolve(msg.filePath);
      return resolvedFile === resolvedTarget;
    });
  }

  const resolvedTarget = path.resolve(targetPath);
  return messages.filter((msg) => {
    const resolvedFile = path.resolve(msg.filePath);
    return (
      resolvedFile.startsWith(resolvedTarget + path.sep) ||
      resolvedFile.startsWith(resolvedTarget + "/")
    );
  });
};

export const processResults = async (
  messages: Array<LintMessage & { filePath: string }>,
  ruleLevelMap: Map<string, { readonly level: number; readonly name: string }> | null,
  diffRange: DiffRangeConfig,
  diffContext: number,
  logger: (msg: string) => void,
): Promise<boolean> => {
const sortByDependencies = (msgs: Array<LintMessage & { filePath: string }>): void => {
    const program = buildProgram();
    if (program && msgs.length > 1) {
      const edges = buildEdges(msgs, program);
      const rank = topoRank(msgs, edges);
      msgs.sort((a, b) => {
        const ra = rank.get(`${path.resolve(a.filePath)}:${a.line}:${a.column}:${a.source}:${(a as any).ruleId ?? (a as any).code ?? "no-rule"}`) ?? 0;
        const rb = rank.get(`${path.resolve(b.filePath)}:${b.line}:${b.column}:${b.source}:${(a as any).ruleId ?? (a as any).code ?? "no-rule"}`) ?? 0;
        if (ra !== rb) return ra - rb;
        if (b.severity - a.severity) return b.severity - a.severity;
        if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
      });
    } else {
      msgs.sort((a, b) => {
        if (b.severity - a.severity) return b.severity - a.severity;
        if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
      });
    }
  };

  sortByDependencies(messages);

  const getPriorityLevel = (m: any): number => {
    if (!ruleLevelMap) return 2;
    return ruleLevelMap.has(ruleIdOf(m)) ? ruleLevelMap.get(ruleIdOf(m))!.level : 2;
  };

  const getPriorityName = (m: any): string => {
    if (!ruleLevelMap) return "Critical Compiler Errors";
    return ruleLevelMap.has(ruleIdOf(m))
      ? ruleLevelMap.get(ruleIdOf(m))!.name
      : "Critical Compiler Errors";
  };

  const printer = async (msgs: Array<LintMessage & { filePath: string }>): Promise<void> => {
    const cache = new Map<string, string[]>();

    const getRuleDocs = (ruleId: string | null | undefined): string | null => {
      if (!ruleId) return null;
      return ruleDocs.getUrl ? ruleDocs.getUrl(ruleId) : null;
    };

    for (const m of msgs.slice(0, 15)) {
      const { filePath, line, column, message, severity, source } = m;
      const sevLabel = severity === 2 ? "[ERROR]" : "[WARN ]";
      const ruleId =
        source === "typescript"
          ? (m as TypeScriptMessage).code
          : (m as ESLintMessage | BiomeMessage).ruleId ?? "unknown";
      const sourceLabel =
        source === "typescript"
          ? "(TypeScript)"
          : source === "biome"
            ? "(Biome)"
            : "(ESLint)";

      logger(`\n${sevLabel} ${filePath}:${line}:${column} ${ruleId} ${sourceLabel} — ${message}`);

      const diffBlock = await getGitDiffBlock(m, diffRange, diffContext);
      let printedFromDiff = false;
      if (diffBlock) {
        logger(diffBlock.heading);
        for (const diffLine of diffBlock.lines) {
          logger(diffLine);
        }
        logger(diffBlock.footer);
        printedFromDiff = true;
      }

      if (!cache.has(filePath)) {
        cache.set(filePath, fs.readFileSync(filePath, "utf8").split("\n"));
      }
      const lines = cache.get(filePath);
      if (!lines) continue;
      const start = Math.max(line - 3, 0);
      const end = Math.min(line + 2, lines.length);
      const diffLineNumbers = diffBlock ? new Set(diffBlock.headLineNumbers) : new Set<number>();

      for (let i = start; i < end; i++) {
        if (printedFromDiff && diffLineNumbers.has(i + 1)) {
          continue;
        }
        const prefix = i === line - 1 ? ">" : " ";
        const num = String(i + 1).padStart(4);
        const currentLine = lines[i] || "";
        const lineContent = ` ${prefix} ${num} | ${currentLine}`;
        logger(lineContent);

        if (i === line - 1) {
          const prefixLength = ` ${prefix} ${num} | `.length;
          let realColumn = 0;
          let visualColumn = 0;
          const targetVisualColumn = column - 1;

          for (let charIndex = 0; charIndex <= currentLine.length; charIndex++) {
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
            if (char === '\t') {
              const tabSize = 8;
              const nextTabStop = Math.floor(visualColumn / tabSize + 1) * tabSize;
              visualColumn = nextTabStop;
            } else if (char === '\r') {
              visualColumn += 0;
            } else if (char === '\n') {
              visualColumn += 1;
            } else {
              visualColumn += 1;
            }
          }

          if (visualColumn < targetVisualColumn) {
            realColumn = currentLine.length;
          }

          const startCol = Math.max(0, Math.min(realColumn, currentLine.length));
          let endCol: number;
          if ("endColumn" in m && m.endColumn) {
            endCol = Math.min(m.endColumn - 1, currentLine.length);
          } else if (source === "typescript") {
            const charAtPos = currentLine[startCol];
            if (message.includes("Expected") && message.includes("arguments")) {
              const beforeCursor = currentLine.substring(0, startCol + 15);
              const funcCallMatch = beforeCursor.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*$/);
              if (funcCallMatch) {
                const lastCommaPos = beforeCursor.lastIndexOf(",");
                const openParenPos = beforeCursor.lastIndexOf("(");
                const targetPos = Math.max(lastCommaPos, openParenPos);
                if (targetPos !== -1) {
                  let newStartCol = targetPos + 1;
                  while (newStartCol < currentLine.length && /\s/.test(currentLine[newStartCol]!)) {
                    newStartCol++;
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
                endCol = Math.min(startCol + wordMatch[0].length, currentLine.length);
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
          logger(`${beforeHighlight}${highlight}`);
        }
      }

      const historyBlock = await getGitHistoryBlock(filePath, line, 3);
      const historyLines = historyBlock ? historyBlock.lines : null;
      const fallbackSnippet = historyBlock?.latestSnippet;
      const blameInfo = await getGitBlameBlock(filePath, line, {
        historyCount: historyBlock?.totalCommits,
        fallbackSnippet,
      });

      const currentShortHash = blameInfo?.shortHash ?? null;
      if (blameInfo) {
        for (const blameLine of blameInfo.lines) {
          logger(blameLine);
        }
      }

      if (historyLines) {
        let skipBlock = false;
        for (const historyLine of historyLines) {
          if (historyLine.startsWith("--- commit ")) {
            const match = historyLine.match(/--- commit\s+([0-9a-fA-F]+)/);
            const historyHash = match ? match[1] : null;
            skipBlock = Boolean(currentShortHash && historyHash && historyHash.startsWith(currentShortHash));
            if (skipBlock) {
              continue;
            }
          }

          if (skipBlock) {
            const trimmed = historyLine.trimStart();
            if (trimmed.startsWith("Total commits")) {
              skipBlock = false;
              logger(historyLine);
            } else if (trimmed.startsWith("Full list")) {
              skipBlock = false;
              logger(historyLine);
            }
            continue;
          }

          logger(historyLine);
        }
      }

      if (source === "eslint") {
        const docsUrl = getRuleDocs((m as ESLintMessage).ruleId || undefined);
        if (docsUrl) {
          logger(`   📖 docs: ${docsUrl}`);
        }
      } else if (source === "biome") {
        const biomeRuleId = (m as BiomeMessage).ruleId;
        if (biomeRuleId) {
          logger(`   📖 docs: https://biomejs.dev/linter/rules/${biomeRuleId}`);
        }
      }
    }
  };

  if (messages.length > 0) {
    const byLevel = new Map<number, typeof messages>();
    for (const m of messages) {
      const level = getPriorityLevel(m);
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level)!.push(m);
    }

    const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);

    for (const level of sortedLevels) {
      const levelMessages = byLevel.get(level)!;
      if (levelMessages.length > 0) {
        const sections = new Map<string, typeof messages>();
        for (const m of levelMessages.slice(0, 15)) {
          const sectionName = getPriorityName(m);
          if (!sections.has(sectionName)) sections.set(sectionName, []);
          sections.get(sectionName)!.push(m);
        }

        for (const [name, arr] of sections) {
          logger(`\n=== ${name} (${arr.length} issues) ===`);
          await printer(arr);
        }

        break;
      }
    }
  }

  const errorCount = messages.filter((m) => m.severity === 2).length;
  const warningCount = messages.filter((m) => m.severity === 1).length;
  const tsErrorCount = messages.filter((m) => m.source === "typescript" && m.severity === 2).length;
  const biomeErrorCount = messages.filter((m) => m.source === "biome" && m.severity === 2).length;
  const eslintErrorCount = messages.filter((m) => m.source === "eslint" && m.severity === 2).length;

  logger(`\n📊 Total: ${errorCount} errors (${tsErrorCount} TypeScript, ${eslintErrorCount} ESLint, ${biomeErrorCount} Biome), ${warningCount} warnings.`);

  return errorCount > 0;
};
