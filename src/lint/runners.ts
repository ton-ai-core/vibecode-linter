// CHANGE: Linter runners module
// WHY: Extract runner logic from lint.ts
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-RUNNERS-001
// SOURCE: lint.ts runner functions

import { exec } from "child_process";
import * as fs from "fs";
import { promisify } from "util";

import type { LinterResult,TypeScriptMessage } from './types.js';

const execAsync = promisify(exec);

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

/**
 * Runs ESLint auto-fix.
 * 
 * @param targetPath - Path to lint
 * @param logger - Logging function
 * @returns Promise of void
 */
export const runESLintFix = async (targetPath: string, logger: (msg: string) => void): Promise<void> => {
  logger(`🔧 Running ESLint auto-fix on: ${targetPath}`);
  
  const isManagerFile = targetPath.includes('manager.ts') || targetPath.includes('src/db');
  const eslintCommand = isManagerFile
    ? `npx eslint "${targetPath}" --ext .ts,.tsx --fix --fix-type directive,problem,suggestion,layout --rule "functional/immutable-data: off" --rule "functional/no-try-statements: off" --rule "functional/functional-parameters: off" --rule "@eslint-community/eslint-comments/no-use: off"`
    : `npx eslint "${targetPath}" --ext .ts,.tsx --fix --fix-type directive,problem,suggestion,layout`;

  await execAsync(eslintCommand);
  logger(`✅ ESLint auto-fix completed`);
};

/**
 * Runs Biome auto-fix.
 * 
 * @param targetPath - Path to lint
 * @param logger - Logging function
 * @returns Promise of void
 */
export const runBiomeFix = async (targetPath: string, logger: (msg: string) => void): Promise<void> => {
  logger(`🔧 Running Biome auto-fix on: ${targetPath}`);
  
  await execAsync(`npx biome check --write "${targetPath}"`);
  logger(`✅ Biome auto-fix completed`);
};

/**
 * Gets TypeScript diagnostics.
 * 
 * @returns Promise of TypeScript messages
 */
export const getTypeScriptDiagnostics = async (): Promise<readonly TypeScriptMessage[]> => {
  const command = `npx tsc --noEmit --pretty false`;
  const { stdout } = await execAsync(command);
  return [];
};

/**
 * Gets ESLint results.
 * 
 * @param targetPath - Path to lint
 * @returns Promise of ESLint results
 */
export const getESLintResults = async (targetPath: string): Promise<ReadonlyArray<LinterResult>> => {
  const isManagerFile = targetPath.includes('manager.ts') || targetPath.includes('src/db');
  const eslintCommand = isManagerFile
    ? `npx eslint "${targetPath}" --ext .ts,.tsx --format json --rule "functional/immutable-data: off" --rule "functional/no-try-statements: off" --rule "functional/functional-parameters: off" --rule "@eslint-community/eslint-comments/no-use: off"`
    : `npx eslint "${targetPath}" --ext .ts,.tsx --format json`;

  const { stdout } = await execAsync(eslintCommand, { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout) as ReadonlyArray<LinterResult>;
};

/**
 * Parses Biome output JSON.
 * 
 * @param stdout - Biome JSON output
 * @returns Array of Biome results
 */
export const parseBiomeOutput = (stdout: string): ReadonlyArray<LinterResult> => {
  const biomeOutput = JSON.parse(stdout);
  const results: Array<{
    filePath: string;
    messages: Array<{
      ruleId: string | null;
      severity: number;
      message: string;
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
    }>;
  }> = [];

  if (biomeOutput.diagnostics && Array.isArray(biomeOutput.diagnostics)) {
    for (const diagnostic of biomeOutput.diagnostics) {
      if (diagnostic.severity === "information") {
        continue;
      }

      const filePath = diagnostic.location?.path?.file || "";
      
      let messageText = "";
      if (typeof diagnostic.description === "string") {
        messageText = diagnostic.description;
      } else if (diagnostic.message) {
        if (Array.isArray(diagnostic.message)) {
          messageText = diagnostic.message.map((m: { content?: string }) =>
            typeof m === "string" ? m : (m.content || "")
          ).join(" ");
        } else if (typeof diagnostic.message === "string") {
          messageText = diagnostic.message;
        }
      } else if (diagnostic.title) {
        messageText = diagnostic.title;
      }

      const enc = new TextEncoder();
      const dec = new TextDecoder("utf-8");

      const toSpan = (span: { start?: number; end?: number } | [number, number] | null | undefined): [number, number] | null => {
        if (!span) return null;
        if (Array.isArray(span) && typeof span[0] === "number") return [span[0], span[1] ?? span[0]];
        if (typeof span === "object" && typeof span.start === "number") return [span.start, span.end ?? span.start];
        return null;
      };

      const byteOffToPos = (text: string, off: number): { readonly line: number; readonly column: number } => {
        const bytes = enc.encode(text);
        const clamped = Math.max(0, Math.min(off >>> 0, bytes.length));
        const prefix = dec.decode(bytes.subarray(0, clamped));
        const nl = prefix.lastIndexOf("\n");
        const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
        const column = nl === -1 ? prefix.length + 1 : prefix.length - nl;
        return { line, column };
      };

      const firstImportOrBOF = (text: string): { readonly line: number; readonly column: number } => {
        const idx = text.search(/^(?:import|export)\b/m);
        if (idx >= 0) {
          const off = enc.encode(text.slice(0, idx)).length;
          return byteOffToPos(text, off);
        }
        return { line: 1, column: 1 };
      };

      let line = 1;
      let column = 1;
      let endLine: number | undefined;
      let endColumn: number | undefined;

      let fileText = "";
      if (filePath) fileText = fs.readFileSync(filePath, "utf8");

      const span = toSpan(diagnostic.location?.span);
      if (span && fileText) {
        const [s, e] = span;
        const p1 = byteOffToPos(fileText, s);
        const p2 = byteOffToPos(fileText, e);
        line = p1.line;
        column = p1.column;
        endLine = p2.line;
        endColumn = p2.column;
      } else if (diagnostic.category === "assist/source/organizeImports" && fileText) {
        const p = firstImportOrBOF(fileText);
        line = p.line;
        column = p.column;
      }

      const message = {
        ruleId: diagnostic.category || null,
        severity: diagnostic.severity === "error" ? 2 : 1,
        message: messageText.trim() || "Biome diagnostic",
        line,
        column,
        endLine,
        endColumn,
      };

      let existingResult = results.find((r) => r.filePath === filePath);
      if (!existingResult) {
        existingResult = { filePath, messages: [] };
        results.push(existingResult);
      }
      existingResult.messages.push(message);
    }
  }

  return results;
};
