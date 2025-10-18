// CHANGE: Git operations module
// WHY: Extract git logic from lint.ts
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-GIT-001
// SOURCE: lint.ts git functions

import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

import { extractDiffSnippet } from './diff-parser.js';
import type { DiffRangeConfig,DiffSnippet } from './types.js';

const execAsync = promisify(exec);

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

/**
 * Finds first diff snippet containing target line.
 * 
 * @param candidates - List of unified diff texts
 * @param targetLine - Target line number in HEAD (1-based)
 * @returns Snippet and index or null
 * 
 * @invariant targetLine > 0
 */
export const pickSnippetForLine = (
  candidates: ReadonlyArray<string>,
  targetLine: number,
): { readonly snippet: DiffSnippet; readonly index: number } | null => {
  if (targetLine <= 0) {
    return null;
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const diff = candidates[i];
    if (!diff || diff.trim().length === 0) {
      continue;
    }
    const snippet = extractDiffSnippet(diff, targetLine);
    if (snippet) {
      return { snippet, index: i };
    }
  }
  return null;
};

/**
 * Detects git diff range (upstream or HEAD).
 * 
 * @param gitCommand - Function to execute git commands
 * @returns Promise of diff range configuration
 */
export const detectDiffRange = async (
  gitCommand: (cmd: string) => Promise<{ readonly stdout: string }>,
): Promise<DiffRangeConfig> => {
  const result = await gitCommand("git rev-parse --abbrev-ref --symbolic-full-name HEAD@{upstream}");
  const upstream = result.stdout.trim();
  
  if (upstream.length > 0) {
    return {
      diffArg: `${upstream}...HEAD`,
      label: `${upstream}...HEAD`,
    };
  }
  
  return {
    diffArg: "HEAD",
    label: "HEAD",
  };
};

/**
 * Detects git diff range with error handling.
 * 
 * @returns Promise of diff range configuration
 */
export const detectDiffRangeWithFallback = async (): Promise<DiffRangeConfig> => {
  const command = async (cmd: string): Promise<{ readonly stdout: string }> => {
    const { stdout } = await execAsync(cmd);
    return { stdout };
  };
  
  return detectDiffRange(command);
};

/**
 * Gets workspace snippet for a file line.
 * 
 * @param filePath - File path
 * @param centerLine - Center line number
 * @param context - Number of context lines
 * @returns Array of formatted lines or null
 */
export const getWorkspaceSnippet = (
  filePath: string,
  centerLine: number,
  context = 2,
): ReadonlyArray<string> | null => {
  const fileContent = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  const start = Math.max(0, centerLine - context - 1);
  const end = Math.min(fileContent.length, centerLine + context);
  if (start >= end) return null;
  const snippet: string[] = [];
  for (let i = start; i < end; i += 1) {
    snippet.push(`${String(i + 1).padStart(4)} | ${fileContent[i] ?? ""}`);
  }
  return snippet;
};

/**
 * Gets commit snippet for a specific line.
 * 
 * @param commitHash - Commit hash
 * @param filePath - File path
 * @param lineNumber - Line number
 * @param context - Context lines
 * @returns Promise of snippet lines or null
 */
export const getCommitSnippetForLine = async (
  commitHash: string,
  filePath: string,
  lineNumber: number,
  context = 3,
): Promise<ReadonlyArray<string> | null> => {
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const { stdout } = await execAsync(`git show ${commitHash}:${relativePath}`);
  const lines = stdout.split(/\r?\n/u);
  if (lineNumber <= 0 || lineNumber > lines.length) {
    return null;
  }
  const start = Math.max(0, lineNumber - context - 1);
  const end = Math.min(lines.length, lineNumber + context);
  const snippet: string[] = [];
  for (let i = start; i < end; i += 1) {
    snippet.push(`${String(i + 1).padStart(4)} | ${lines[i] ?? ""}`);
  }
  return snippet;
};
