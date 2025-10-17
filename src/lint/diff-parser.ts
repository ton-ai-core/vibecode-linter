// CHANGE: Diff parsing module
// WHY: Extract diff parsing logic into separate pure functions
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-DIFF-001
// SOURCE: lint.ts diff parsing functions

import type { DiffLineView, DiffSnippet, DiffSymbol } from './types.js';

const TAB_WIDTH = 8;

/**
 * Extracts diff snippet for a specific line.
 * 
 * @param unifiedDiff - Complete unified diff text
 * @param targetLine - Target line number in HEAD (1-based)
 * @returns Diff snippet or null if line unchanged
 * 
 * @invariant targetLine > 0
 * @complexity O(n) where n is number of diff lines
 */
export const extractDiffSnippet = (
  unifiedDiff: string,
  targetLine: number,
): DiffSnippet | null => {
  if (targetLine <= 0) {
    return null;
  }
  
  const lines = unifiedDiff.split(/\r?\n/u);
  const headerPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
  
  interface ParseState {
    readonly currentHeader: string;
    readonly currentLines: ReadonlyArray<DiffLineView>;
    readonly currentPointer: number | null;
    readonly headLine: number;
    readonly result: DiffSnippet | null;
  }
  
  const initialState: ParseState = {
    currentHeader: "",
    currentLines: [],
    currentPointer: null,
    headLine: 0,
    result: null,
  };
  
  const finalState = lines.reduce<ParseState>((state, line) => {
    if (state.result) {
      return state;
    }
    
    if (line.startsWith("@@")) {
      // Flush previous snippet if pointer was found
      if (state.currentHeader && state.currentPointer !== null) {
        return {
          ...state,
          result: {
            header: state.currentHeader,
            lines: state.currentLines,
            pointerIndex: state.currentPointer,
          },
        };
      }
      
      // Start new hunk
      const match = headerPattern.exec(line);
      const newHeadLine = match ? Number.parseInt(match[1] ?? "0", 10) : 0;
      
      return {
        currentHeader: line,
        currentLines: [],
        currentPointer: null,
        headLine: newHeadLine,
        result: null,
      };
    }
    
    if (!state.currentHeader) {
      return state;
    }
    
    const symbol = line.length > 0 ? (line[0] as DiffSymbol) : undefined;
    const headLineNumber: number | null = 
      (symbol === "+" || symbol === " ") ? state.headLine : null;
    const newHeadLine = (symbol === "+" || symbol === " ") 
      ? state.headLine + 1 
      : state.headLine;
    
    const content = symbol ? line.slice(1) : line;
    const lineView: DiffLineView = {
      raw: line,
      symbol,
      headLineNumber,
      content,
    };
    
    const newLines = [...state.currentLines, lineView];
    const newPointer = headLineNumber === targetLine 
      ? newLines.length - 1 
      : state.currentPointer;
    
    return {
      ...state,
      currentLines: newLines,
      currentPointer: newPointer,
      headLine: newHeadLine,
    };
  }, initialState);
  
  // Check final state
  if (finalState.result) {
    return finalState.result;
  }
  
  if (finalState.currentHeader && finalState.currentPointer !== null) {
    return {
      header: finalState.currentHeader,
      lines: finalState.currentLines,
      pointerIndex: finalState.currentPointer,
    };
  }
  
  return null;
};

/**
 * Computes real character index from visual column considering tabs.
 * 
 * @param lineContent - Line text
 * @param visualColumn - Visual column (0-based)
 * @param tabSize - Tab width, defaults to 8
 * @returns Real character index (0-based)
 * 
 * @invariant visualColumn >= 0
 * @invariant result >= 0 && result <= lineContent.length
 * @complexity O(n) where n is lineContent.length
 */
export const computeRealColumnFromVisual = (
  lineContent: string,
  visualColumn: number,
  tabSize = TAB_WIDTH,
): number => {
  if (visualColumn < 0) {
    return 0;
  }
  
  interface ColumnState {
    readonly realColumn: number;
    readonly currentVisual: number;
    readonly found: boolean;
  }
  
  const initialState: ColumnState = {
    realColumn: 0,
    currentVisual: 0,
    found: false,
  };
  
  const finalState = Array.from(lineContent).reduce<ColumnState>((state, char, index) => {
    if (state.found) {
      return state;
    }
    
    if (state.currentVisual === visualColumn) {
      return { ...state, realColumn: index, found: true };
    }
    
    if (state.currentVisual > visualColumn) {
      return { ...state, realColumn: index, found: true };
    }
    
    if (char === "\t") {
      const nextTabStop = Math.floor(state.currentVisual / tabSize + 1) * tabSize;
      if (nextTabStop >= visualColumn) {
        return {
          ...state,
          currentVisual: nextTabStop,
          realColumn: index + 1,
          found: true,
        };
      }
      return { ...state, currentVisual: nextTabStop };
    }
    
    return { ...state, currentVisual: state.currentVisual + 1 };
  }, initialState);
  
  return finalState.found ? finalState.realColumn : lineContent.length;
};

/**
 * Expands tabs to spaces for display.
 * 
 * @param content - Text with possible tabs
 * @param tabWidth - Tab width, defaults to 8
 * @returns Text with tabs expanded to spaces
 * 
 * @complexity O(n) where n is content.length
 */
export const expandTabs = (content: string, tabWidth = TAB_WIDTH): string => {
  interface ExpandState {
    readonly result: string;
    readonly column: number;
  }
  
  const initialState: ExpandState = {
    result: "",
    column: 0,
  };
  
  const finalState = Array.from(content).reduce<ExpandState>((state, char) => {
    if (char === "\t") {
      const spaces = tabWidth - (state.column % tabWidth);
      return {
        result: state.result + " ".repeat(spaces),
        column: state.column + spaces,
      };
    }
    
    return {
      result: state.result + char,
      column: state.column + 1,
    };
  }, initialState);
  
  return finalState.result;
};
