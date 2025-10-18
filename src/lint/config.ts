// CHANGE: Configuration loading module
// WHY: Extract config logic from lint.ts
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-CONFIG-001
// SOURCE: lint.ts loadLinterConfig, makeRuleLevelMap

import * as fs from "fs";
import * as path from "path";

import { type Either, left, right } from './either.js';
import type { LinterConfig } from './types.js';

/**
 * Loads linter configuration from file.
 * 
 * @param configPath - Path to configuration file
 * @returns Either configuration or error
 * 
 * @complexity O(n) where n is size of config file
 */
export const loadLinterConfig = (configPath: string): Either<Error, LinterConfig> => {
  const readResult = ((): string => {
    const fileContents = fs.readFileSync(configPath, "utf8");
    return fileContents;
  })();
  
  if (!readResult) {
    return left(new Error("Could not read config file"));
  }
  
  const parseResult = ((): Record<string, ReadonlyArray<{ level: number; name: string; rules: string[] }>> => {
    const parsed = JSON.parse(readResult) as Record<string, ReadonlyArray<{ level: number; name: string; rules: string[] }>>;
    return parsed;
  })();
  
  const levels = parseResult["priorityLevels"];
  
  if (!Array.isArray(levels)) {
    return left(new Error("Invalid config: priorityLevels must be an array"));
  }
  
  type DeepReadonlyPriorityLevel = {
    readonly level: number;
    readonly name: string; 
    readonly rules: ReadonlyArray<string>;
  };
  
  const normalized: LinterConfig = {
    priorityLevels: levels.map((pl: DeepReadonlyPriorityLevel) => ({
      level: pl.level,
      name: pl.name,
      rules: pl.rules.map((r: string) => String(r).toLowerCase()),
    })),
  };
  
  return right(normalized);
};

/**
 * Creates a map from rule ID to priority level.
 * 
 * @param cfg - Linter configuration
 * @returns Map of rule ID to level metadata
 * 
 * @complexity O(n*m) where n is number of levels and m is rules per level
 */
type DeepReadonlyLinterConfig = {
  readonly priorityLevels: ReadonlyArray<{
    readonly level: number;
    readonly name: string;
    readonly rules: ReadonlyArray<string>;
  }>;
};

export const makeRuleLevelMap = (cfg: DeepReadonlyLinterConfig): Map<string, { readonly level: number; readonly name: string }> =>
  new Map(
    cfg.priorityLevels.flatMap(pl =>
      pl.rules.map(r => [r, { level: pl.level, name: pl.name }] as const)
    )
  );

/**
 * Extracts rule ID from a lint message.
 * 
 * @param m - Lint message
 * @returns Rule ID string
 * 
 * @complexity O(1)
 */
export const ruleIdOf = (m: { readonly ruleId?: string | null; readonly code?: string } | Record<string, never>): string => {
  return String(m.ruleId ?? m.code ?? "").toLowerCase();
};

/**
 * Loads config from default path or returns null.
 * 
 * @returns Either configuration or null
 */
export const loadDefaultConfig = (cwd: string = process.cwd()): LinterConfig | null => {
  const configPath = path.resolve(cwd, "linter.config.json");
  const result = loadLinterConfig(configPath);
  return result.tag === "Right" ? result.value : null;
};
