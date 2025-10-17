// CHANGE: Dependency analysis module
// WHY: Extract TypeScript AST analysis from lint.ts
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-DEP-001
// SOURCE: lint.ts dependency functions

import * as path from "path";
import ts from "typescript";

import type { LintMessage } from './types.js';

type MsgId = string;

const __msgId = (f: string, m: LintMessage & { filePath: string }): string =>
  `${path.resolve(f)}:${m.line}:${m.column}:${m.source}:${(m as any).ruleId ?? (m as any).code ?? "no-rule"}`;

export const buildProgram = (): ts.Program | null => {
  const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfigPath));
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
};

const posOf = (sf: ts.SourceFile, m: { line: number; column: number; endLine?: number; endColumn?: number }): { start: number; end: number } => {
  const start = ts.getPositionOfLineAndCharacter(sf, Math.max(0, m.line - 1), Math.max(0, m.column - 1));
  const end = (m.endLine && m.endColumn) ?
    ts.getPositionOfLineAndCharacter(sf, m.endLine - 1, Math.max(0, m.endColumn - 1)) : start;
  return { start, end };
};

const nodeAt = (sf: ts.SourceFile, pos: number): ts.Node => {
  let n: ts.Node = sf;
  const visit = (node: ts.Node): void => {
    if (pos >= node.getStart(sf) && pos < node.getEnd()) {
      n = node;
      ts.forEachChild(node, visit);
    }
  };
  visit(sf);

  while (n.parent && !ts.isIdentifier(n) && !ts.isCallExpression(n) && !ts.isPropertyAccessExpression(n) && !ts.isElementAccessExpression(n)) {
    n = n.parent;
  }
  return n;
};

const defSymbols = (checker: ts.TypeChecker, n: ts.Node): ts.Symbol[] => {
  const locus = ts.isIdentifier(n) ? n :
    ts.isPropertyAccessExpression(n) ? n.name :
    ts.isElementAccessExpression(n) ? n.argumentExpression : n;
  const s0 = checker.getSymbolAtLocation(locus);
  if (!s0) return [];
  const s = (s0.getFlags() & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(s0) : s0;
  return s ? [s] : [];
};

export const buildEdges = (messages: Array<LintMessage & { filePath: string }>, program: ts.Program): Array<[MsgId, MsgId]> => {
  const byFile = new Map<string, Array<LintMessage & { filePath: string }>>();
  for (const m of messages) {
    const f = path.resolve(m.filePath);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f)!.push(m);
  }

  const checker = program.getTypeChecker();
  const edges: Array<[MsgId, MsgId]> = [];

  for (const [file, msgs] of byFile) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;

    for (const mu of msgs) {
      const { start } = posOf(sf, mu);
      const node = nodeAt(sf, start);
      const syms = defSymbols(checker, node);

      for (const sym of syms) {
        const decls = sym.declarations ?? [];
        for (const decl of decls) {
          const df = path.resolve(decl.getSourceFile().fileName);
          const dMsgs = byFile.get(df);
          if (!dMsgs || dMsgs.length === 0) continue;

          const ds = decl.getStart();
          const de = decl.getEnd();
          const dsf = program.getSourceFile(df)!;
          const found = dMsgs.find(dm => {
            const p = posOf(dsf, dm);
            return p.start >= ds && p.end <= de;
          });
          if (found) edges.push([__msgId(df, found), __msgId(file, mu)]);
        }
      }
    }

    sf.forEachChild(node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        const resolved = ts.resolveModuleName(spec, file, program.getCompilerOptions(), ts.sys).resolvedModule;
        if (!resolved) return;
        const target = path.resolve(resolved.resolvedFileName);
        const tMsgs = byFile.get(target);
        if (!tMsgs || tMsgs.length === 0) return;
        const from = __msgId(target, tMsgs[0]!);
        for (const mu of msgs) edges.push([from, __msgId(file, mu)]);
      }
    });
  }
  return edges;
};

export const topoRank = (messages: Array<LintMessage & { filePath: string }>, edges: Array<[MsgId, MsgId]>): Map<MsgId, number> => {
  const ids: MsgId[] = messages.map(m => __msgId(m.filePath, m));
  const succ = new Map<MsgId, Set<MsgId>>();
  const indeg = new Map<MsgId, number>();

  for (const id of ids) {
    succ.set(id, new Set());
    indeg.set(id, 0);
  }

  for (const [u, v] of edges) {
    if (!succ.has(u) || !succ.has(v)) continue;
    if (!succ.get(u)!.has(v)) {
      succ.get(u)!.add(v);
      indeg.set(v, (indeg.get(v) ?? 0) + 1);
    }
  }

  const q = ids.filter(id => (indeg.get(id) ?? 0) === 0).sort();
  const order: MsgId[] = [];

  while (q.length) {
    const u = q.shift()!;
    order.push(u);
    for (const v of succ.get(u) ?? []) {
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if ((indeg.get(v) ?? 0) === 0) q.push(v);
    }
    q.sort();
  }

  if (order.length !== ids.length) {
    for (const id of ids) if (!order.includes(id)) order.push(id);
  }

  return new Map(order.map((id, i) => [id, i]));
};
