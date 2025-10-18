// CHANGE: Advanced git operations module
// WHY: Extract complex git functions from lint.ts
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-GIT-ADV-001
// SOURCE: lint.ts advanced git functions

import { exec } from "child_process";
import * as path from "path";
import { promisify } from "util";

import { computeRealColumnFromVisual, expandTabs } from './diff-parser.js';
import { getCommitSnippetForLine,pickSnippetForLine } from './git.js';
import type { DiffRangeConfig,LintMessage } from './types.js';

const execAsync = promisify(exec);
const TAB_WIDTH = 8;

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

interface DiffSnippetSelection {
  readonly snippet: any;
  readonly descriptor: string;
}

export interface GitDiffBlock {
  readonly heading: string;
  readonly lines: ReadonlyArray<string>;
  readonly footer: string;
  readonly headLineNumbers: ReadonlySet<number>;
}

export interface GitHistoryBlock {
  readonly lines: ReadonlyArray<string>;
  readonly totalCommits: number;
  readonly latestSnippet?: ReadonlyArray<string>;
}

export interface GitBlameOptions {
  historyCount?: number;
  fallbackSnippet?: ReadonlyArray<string>;
}

export interface GitBlameResult {
  lines: ReadonlyArray<string>;
  commitHash: string | null;
  shortHash: string | null;
}

export const visualColumnAt = (content: string, index: number, tabWidth = TAB_WIDTH): number => {
  let column = 0;
  const limit = Math.max(0, Math.min(index, content.length));
  for (let i = 0; i < limit; i += 1) {
    const ch = content[i];
    if (ch === "\t") {
      const offset = tabWidth - (column % tabWidth);
      column += offset;
    } else {
      column += 1;
    }
  }
  return column;
};

export const getGitDiffBlock = async (
  message: LintMessage & { filePath: string },
  range: DiffRangeConfig,
  contextLines: number,
): Promise<GitDiffBlock | null> => {
  const normalizedContext = contextLines > 0 ? contextLines : 3;

  const attempts: Array<{ readonly descriptor: string; readonly command: string }> = [
    {
      descriptor: range.label,
      command: `git diff --unified=${normalizedContext} ${range.diffArg} -- "${message.filePath}"`,
    },
    {
      descriptor: "workspace",
      command: `git diff --unified=${normalizedContext} -- "${message.filePath}"`,
    },
    {
      descriptor: "index",
      command: `git diff --cached --unified=${normalizedContext} -- "${message.filePath}"`,
    },
  ];

  const diffOutputs: string[] = [];
  const descriptors: string[] = [];
  let selection: DiffSnippetSelection | null = null;

  for (const attempt of attempts) {
    let diffOutput = "";
    const { stdout } = await execAsync(attempt.command, { maxBuffer: 10 * 1024 * 1024 });
    diffOutput = stdout;

    if (diffOutput.trim().length === 0) {
      continue;
    }

    diffOutputs.push(diffOutput);
    descriptors.push(attempt.descriptor);

    const pickResult = pickSnippetForLine(diffOutputs, message.line);
    if (pickResult) {
      const descriptorIndex = pickResult.index;
      const descriptor = descriptors[descriptorIndex] ?? attempt.descriptor;
      selection = {
        snippet: pickResult.snippet,
        descriptor,
      };
      break;
    }
  }

  if (!selection) {
    return null;
  }

  const { snippet, descriptor } = selection;
  const pointerIndex = snippet.pointerIndex;
  if (pointerIndex === null) {
    return null;
  }

  const pointerLine = snippet.lines[pointerIndex];
  if (!pointerLine) {
    return null;
  }

  const visualStart = Math.max(0, message.column - 1);
  const startColumn = computeRealColumnFromVisual(pointerLine.content, visualStart);
  let endVisual = visualStart + 1;
  if ("endColumn" in message && typeof message.endColumn === "number" && Number.isFinite(message.endColumn)) {
    endVisual = Math.max(visualStart + 1, message.endColumn - 1);
  }
  const endColumn = computeRealColumnFromVisual(pointerLine.content, endVisual);

  const clampedStart = Math.min(startColumn, pointerLine.content.length);
  const clampedEnd = Math.max(clampedStart + 1, Math.min(pointerLine.content.length, endColumn));

  const refineHighlightRange = (content: string, start: number, end: number, msg: any): { start: number; end: number } => {
    const text = typeof msg === "string" ? msg :
      (msg && typeof msg === "object" && "message" in msg) ?
        (typeof msg.message === "string" ? msg.message : String(msg.message)) :
        String(msg);
    const identMatch = text.match(/["']([A-Za-z0-9_$]+)["']/);
    if (identMatch) {
      const identifier = identMatch[1];
      const foundIdx = content.indexOf(identifier);
      if (foundIdx !== -1) {
        return { start: foundIdx, end: foundIdx + identifier.length };
      }
    }
    return { start, end };
  };

  const refinedRange = refineHighlightRange(pointerLine.content, clampedStart, clampedEnd, message);
  const rangeStart = Math.max(0, Math.min(refinedRange.start, pointerLine.content.length));
  const rangeEnd = Math.max(rangeStart + 1, Math.min(pointerLine.content.length, refinedRange.end));

  const headLineNumbers = new Set<number>();
  const formattedLines: string[] = [];
  snippet.lines.forEach((line: any) => {
    const lineNumber = line.headLineNumber !== null ? String(line.headLineNumber).padStart(4) : "    ";
    const symbol = line.symbol ?? " ";
    if (line.headLineNumber !== null) {
      headLineNumbers.add(line.headLineNumber);
    }
    formattedLines.push(`${symbol} ${lineNumber} | ${expandTabs(line.content, TAB_WIDTH)}`);
  });

  if (pointerLine) {
    const pointerLabel = "    ";
    const pointerExpanded = expandTabs(pointerLine.content, TAB_WIDTH);
    const visualStartColumn = Math.max(0, visualColumnAt(pointerLine.content, rangeStart, TAB_WIDTH));
    const visualEndColumn = Math.max(visualStartColumn + 1, visualColumnAt(pointerLine.content, rangeEnd, TAB_WIDTH));
    const cappedEnd = Math.min(pointerExpanded.length, visualEndColumn);
    const caretBase = `${" ".repeat(Math.min(visualStartColumn, pointerExpanded.length))}${"^".repeat(Math.max(1, cappedEnd - visualStartColumn))}`;
    const caretOverlay = caretBase.padEnd(pointerExpanded.length, " ");
    const caretLinePrefixLength = 1 + 1 + pointerLabel.length + 1 + 1 + 1;
    const caretLine = `${" ".repeat(caretLinePrefixLength)}${caretOverlay}`;
    formattedLines.splice(pointerIndex + 1, 0, caretLine);
  }

  return {
    heading: `--- git diff (${descriptor}, U=${normalizedContext}) -------------------------`,
    lines: [snippet.header, ...formattedLines],
    footer: "---------------------------------------------------------------",
    headLineNumbers,
  };
};

export const getGitBlameBlock = async (
  filePath: string,
  line: number,
  options?: GitBlameOptions,
): Promise<GitBlameResult | null> => {
  const contextSize = 2;
  const startLine = Math.max(1, line - contextSize);
  const endLine = line + contextSize;
  const blameCommand = `git blame --line-porcelain -L ${startLine},${endLine} -- "${filePath}"`;
  let blameOutput = "";

  const { stdout } = await execAsync(blameCommand, { maxBuffer: 2 * 1024 * 1024 });
  blameOutput = stdout;

  const trimmed = blameOutput.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const rows = trimmed.split(/\r?\n/u);
  const headerTokens = rows[0]?.split(" ") ?? [];
  const commitHash = headerTokens[0] ?? "";
  const originalLineNumber = Number.parseInt(headerTokens[1] ?? "0", 10) || line;
  const authorLine = rows.find((row) => row.startsWith("author "));
  const author = authorLine ? authorLine.slice("author ".length).trim() : "unknown";
  const authorTimeLine = rows.find((row) => row.startsWith("author-time "));
  const authorEpoch = authorTimeLine ? Number.parseInt(authorTimeLine.slice("author-time ".length), 10) : Number.NaN;
  const summaryLine = rows.find((row) => row.startsWith("summary "));
  const summary = summaryLine ? summaryLine.slice("summary ".length).trim() : "(no summary)";
  const sourceLine = rows.find((row) => row.startsWith("\t"));
  const codeText = sourceLine ? sourceLine.slice(1) : "";

  const dateString = Number.isFinite(authorEpoch)
    ? new Date(authorEpoch * 1000).toISOString().slice(0, 10)
    : "unknown-date";

  const shortHash = commitHash.slice(0, 12);
  const isZeroHash = /^0+$/.test(commitHash);

  const baseHeading = `--- git blame (line ${line}) ------------------------------------`;
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  if (isZeroHash) {
    const before = Math.max(1, line - contextSize);
    const after = line + contextSize;
    return {
      lines: [
        baseHeading,
        `Command: git blame -L ${before},${after} -- ${relativePath} | cat`,
      ],
      commitHash: null,
      shortHash: null,
    };
  }

  const lines: string[] = [
    baseHeading,
    `commit ${shortHash} (${dateString})  Author: ${author}`,
  ];
  lines.push(`summary: ${summary}`);
  lines.push(`${line}) ${codeText}`);

  if (typeof options?.historyCount === "number") {
    lines.push(`Total commits for line: ${options.historyCount}`);
  }

  lines.push(`Commands: git blame -L ${line},${line} -- ${relativePath} | cat`);

  const commitSnippet = await getCommitSnippetForLine(commitHash, filePath, originalLineNumber, contextSize);
  if (options?.fallbackSnippet && options?.fallbackSnippet.length > 0) {
    lines.push("Code context:");
    for (const snippetLine of options?.fallbackSnippet) {
      lines.push(snippetLine);
    }
  }

  return {
    lines,
    commitHash,
    shortHash,
  };
};

export const getGitHistoryBlock = async (
  filePath: string,
  line: number,
  limit: number,
): Promise<GitHistoryBlock | null> => {
  const historyCommand = `git log -L ${line},${line}:${filePath} --date=short`;
  let historyOutput = "";

  const { stdout } = await execAsync(historyCommand, { maxBuffer: 5 * 1024 * 1024 });
  historyOutput = stdout;

  const trimmed = historyOutput.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const segments: string[] = [];
  let currentSegment = "";
  const historyLines = trimmed.split(/\r?\n/u);
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  for (const row of historyLines) {
    if (row.startsWith("commit ") && currentSegment.length > 0) {
      segments.push(currentSegment.trimEnd());
      currentSegment = `${row}\n`;
    } else {
      currentSegment += `${row}\n`;
    }
  }
  if (currentSegment.trim().length > 0) {
    segments.push(currentSegment.trimEnd());
  }

  const header = "--- history (recent line updates) -------------------------";
  const result: string[] = [header];
  let taken = 0;
  let latestSnippet: ReadonlyArray<string> | undefined;

  for (const segment of segments) {
    if (taken >= limit) {
      break;
    }
    const lines = segment.split(/\r?\n/u);
    const commitLine = lines.find((row) => row.startsWith("commit "));
    if (!commitLine) {
      continue;
    }
    const hash = commitLine.slice("commit ".length).trim();
    const shortHash = hash.slice(0, 12);
    const dateLine = lines.find((row) => row.startsWith("Date:"));
    const date = dateLine ? (dateLine.slice("Date:".length).trim().split(" ")[0] ?? "unknown-date") : "unknown-date";
    const messageLine = lines.find((row) => row.startsWith("    "));
    const summaryRaw = messageLine ? messageLine.trim() : "(no subject)";
    const summary = summaryRaw.length > 100 ? `${summaryRaw.slice(0, 97)}...` : summaryRaw;

    let changeLine = "";
    let inHunk = false;
    for (const row of lines) {
      if (row.startsWith("@@")) {
        inHunk = true;
        continue;
      }
      if (!inHunk) {
        continue;
      }
      if (row.startsWith("commit ") || row.startsWith("diff --git ")) {
        break;
      }
      if ((row.startsWith("+") || row.startsWith("-")) && row.length > 1) {
        changeLine = `${row[0]} ${row.slice(1).trim()}`;
        break;
      }
    }

    const snippet = await getCommitSnippetForLine(hash, filePath, line, 2);
    const snippetLines = snippet && snippet.length > 0 ? snippet : undefined;
    const heading = `--- commit ${shortHash} (${date}) -------------------------`;
    result.push(heading);
    result.push(`summary: ${summary}`);
    result.push(`git show ${shortHash} -- ${relativePath} | cat`);
    if (snippetLines) {
      for (const snippetLine of snippetLines) {
        result.push(snippetLine);
      }
      if (!latestSnippet) {
        latestSnippet = snippetLines;
      }
    } else {
      result.push(`(code for commit ${shortHash} is not available)`);
    }

    taken += 1;
  }

  const totalCommits = segments.length;
  if (result.length > 1) {
    result.push(`Total commits for line: ${totalCommits}`);
    result.push(`Full list: git log --follow -- ${relativePath} | cat`);
    return { lines: result, totalCommits, latestSnippet };
  }
  return null;
};
