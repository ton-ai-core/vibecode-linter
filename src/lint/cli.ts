// CHANGE: CLI argument parsing module
// WHY: Extract CLI logic from lint.ts
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-CLI-001
// SOURCE: lint.ts parseCLIArgs

import type { CLIOptions } from './types.js';

/**
 * Parses CLI arguments into options.
 * 
 * @param args - Command line arguments
 * @returns Parsed CLI options
 * 
 * @invariant Result has all required fields
 * @complexity O(n) where n is length of args
 */
export const parseCLIArgs = (args: ReadonlyArray<string>): CLIOptions => {
  interface ParseState {
    readonly targetPath: string;
    readonly maxClones: number;
    readonly width: number;
    readonly context?: number;
    readonly noFix: boolean;
    readonly skip: boolean;
  }
  
  const initialState: ParseState = {
    targetPath: ".",
    maxClones: 15,
    width: process.stdout.columns || 120,
    context: undefined,
    noFix: false,
    skip: false,
  };
  
  const result = args.reduce<ParseState>((state, arg, index) => {
    if (state.skip) {
      return { ...state, skip: false };
    }
    
    if (arg === "--max-clones" && index + 1 < args.length) {
      const nextArg = args[index + 1];
      return {
        ...state,
        maxClones: Number.parseInt(nextArg ?? "15", 10),
        skip: true,
      };
    }
    
    if (arg === "--width" && index + 1 < args.length) {
      const nextArg = args[index + 1];
      return {
        ...state,
        width: Number.parseInt(nextArg ?? "120", 10),
        skip: true,
      };
    }
    
    if (arg === "--context" && index + 1 < args.length) {
      const nextArg = args[index + 1];
      return {
        ...state,
        context: Number.parseInt(nextArg ?? "3", 10),
        skip: true,
      };
    }
    
    if (arg === "--no-fix") {
      return { ...state, noFix: true };
    }
    
    if (arg && !arg.startsWith("--")) {
      return { ...state, targetPath: arg };
    }
    
    return state;
  }, initialState);
  
  const { skip: _skip, ...options } = result;
  return options;
};
