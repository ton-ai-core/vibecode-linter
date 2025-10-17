// CHANGE: Type definitions module
// WHY: Separate types for better modularity
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-TYPES-001
// SOURCE: lint.ts type definitions

export type DiffSymbol = "+" | "-" | " " | "@" | "\\" | undefined;

/**
 * Line view from unified diff with metadata.
 * 
 * @property raw - Complete line text with diff prefix
 * @property symbol - Diff symbol (+, -, space, @, \)
 * @property headLineNumber - Line number in HEAD or null if deleted
 * @property content - Line content without diff prefix
 * 
 * @invariant headLineNumber > 0 || headLineNumber === null
 */
export interface DiffLineView {
  readonly raw: string;
  readonly symbol: DiffSymbol;
  readonly headLineNumber: number | null;
  readonly content: string;
}

/**
 * Diff fragment with highlighted line.
 * 
 * @property header - Hunk header (@@ ... @@)
 * @property lines - Lines in this hunk
 * @property pointerIndex - Index of target HEAD line in lines array
 * 
 * @invariant pointerIndex === null || (pointerIndex >= 0 && pointerIndex < lines.length)
 */
export interface DiffSnippet {
  readonly header: string;
  readonly lines: ReadonlyArray<DiffLineView>;
  readonly pointerIndex: number | null;
}

/**
 * Configuration for linting priority levels.
 * 
 * @property priorityLevels - Ordered list of priority configurations
 * 
 * @invariant Each level number is unique
 */
export interface LinterConfig {
  readonly priorityLevels: ReadonlyArray<{
    readonly level: number;
    readonly name: string;
    readonly rules: ReadonlyArray<string>;
  }>;
}

/**
 * Base diagnostic message fields.
 */
interface BaseMessage {
  readonly severity: number;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

/**
 * ESLint diagnostic message.
 */
export interface ESLintMessage extends BaseMessage {
  readonly ruleId: string | null;
  readonly source: "eslint";
}

/**
 * TypeScript diagnostic message.
 */
export interface TypeScriptMessage extends BaseMessage {
  readonly code: string;
  readonly source: "typescript";
  readonly filePath: string;
}

/**
 * Biome diagnostic message.
 */
export interface BiomeMessage extends BaseMessage {
  readonly ruleId: string | null;
  readonly source: "biome";
}

/**
 * Union type for all lint messages.
 */
export type LintMessage = ESLintMessage | TypeScriptMessage | BiomeMessage;

/**
 * CLI options for linting.
 */
export interface CLIOptions {
  readonly targetPath: string;
  readonly maxClones: number;
  readonly width: number;
  readonly context?: number;
  readonly noFix: boolean;
}

/**
 * Git diff range configuration.
 */
export interface DiffRangeConfig {
  readonly diffArg: string;
  readonly label: string;
}

/**
 * Linter result with messages.
 */
export interface LinterResult {
  readonly filePath: string;
  readonly messages: ReadonlyArray<{
    readonly ruleId: string | null;
    readonly severity: number;
    readonly message: string;
    readonly line: number;
    readonly column: number;
    readonly endLine?: number;
    readonly endColumn?: number;
  }>;
}
