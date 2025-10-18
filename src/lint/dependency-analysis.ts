// CHANGE: Dependency analysis module in functional style
// WHY: Use TypeScript Compiler API (imperative) from pure functions
// QUOTE(TЗ): "функциональная парадигма"
// REF: REQ-LINT-DEP-001
// SOURCE: lint.ts dependency functions

import * as path from "path";
import ts from "typescript";

import type { LintMessage } from './types.js';

type MsgId = string;

const msgId = (f: string, m: LintMessage & { readonly filePath: string }): MsgId =>
  `${path.resolve(f)}:${m.line}:${m.column}:${m.source}:${(m as { readonly ruleId?: string; readonly code?: string }).ruleId ?? (m as { readonly code?: string }).code ?? "no-rule"}`;

export const buildProgram = (cwd: string = process.cwd()): ts.Program | null => {
  const tsconfigPath = path.resolve(cwd, "tsconfig.json");
  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfigPath));
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
};

const posOf = (sf: ts.SourceFile, m: { readonly line: number; readonly column: number; readonly endLine?: number; readonly endColumn?: number }): { readonly start: number; readonly end: number } => {
  const start = ts.getPositionOfLineAndCharacter(sf, Math.max(0, m.line - 1), Math.max(0, m.column - 1));
  const end = (m.endLine && m.endColumn) ?
    ts.getPositionOfLineAndCharacter(sf, m.endLine - 1, Math.max(0, m.endColumn - 1)) : start;
  return { start, end };
};

const getChildren = (node: ts.Node): ReadonlyArray<ts.Node> => {
  const result: ts.Node[] = [];
  node.forEachChild((child: ts.Node) => {
    result.push(child);
    return undefined;
  });
  return result;
};

const findNodeAt = (sf: ts.SourceFile, pos: number): ts.Node => {
  const visitor = (node: ts.Node, currentBest: ts.Node): ts.Node => {
    if (pos >= node.getStart(sf) && pos < node.getEnd()) {
      const newBest = node;
      const children = getChildren(node);
      return children.reduce((best, child) => visitor(child, best), newBest);
    }
    return currentBest;
  };

  const node = visitor(sf, sf);
  
  const refineNode = (n: ts.Node): ts.Node => {
    if (!n.parent) return n;
    if (ts.isIdentifier(n) || ts.isCallExpression(n) || ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      return n;
    }
    return refineNode(n.parent);
  };

  return refineNode(node);
};

const defSymbols = (checker: ts.TypeChecker, n: ts.Node): readonly ts.Symbol[] => {
  const locus = ts.isIdentifier(n) ? n :
    ts.isPropertyAccessExpression(n) ? n.name :
    ts.isElementAccessExpression(n) ? n.argumentExpression : n;
  const s0 = checker.getSymbolAtLocation(locus);
  if (!s0) return [];
  const s = (s0.getFlags() & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(s0) : s0;
  return s ? [s] : [];
};

const groupByFile = (messages: ReadonlyArray<LintMessage & { readonly filePath: string }>): ReadonlyMap<string, ReadonlyArray<LintMessage & { readonly filePath: string }>> =>
  messages.reduce(
    (acc, m) => {
      const f = path.resolve(m.filePath);
      const existing = acc.get(f) ?? [];
      return new Map(acc).set(f, [...existing, m]);
    },
    new Map<string, ReadonlyArray<LintMessage & { readonly filePath: string }>>()
  );

const collectImportEdges = (
  file: string,
  msgs: ReadonlyArray<LintMessage & { readonly filePath: string }>,
  sf: ts.SourceFile,
  program: ts.Program,
  byFile: ReadonlyMap<string, ReadonlyArray<LintMessage & { readonly filePath: string }>>
): ReadonlyArray<readonly [MsgId, MsgId]> => {
  const children = getChildren(sf);
  
  return children.flatMap((node: ts.Node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) {
      return [];
    }
    
    const spec = node.moduleSpecifier.text;
    const resolved = ts.resolveModuleName(spec, file, program.getCompilerOptions(), ts.sys).resolvedModule;
    
    if (!resolved) return [];
    
    const target = path.resolve(resolved.resolvedFileName);
    const tMsgs = byFile.get(target);
    
    if (!tMsgs || tMsgs.length === 0) return [];
    
    const from = msgId(target, tMsgs[0]!);
    return msgs.map(mu => [from, msgId(file, mu)] as const);
  });
};

export const buildEdges = (messages: ReadonlyArray<LintMessage & { readonly filePath: string }>, program: ts.Program): ReadonlyArray<readonly [MsgId, MsgId]> => {
  const byFile = groupByFile(messages);
  const checker = program.getTypeChecker();

  const symbolEdges = Array.from(byFile.entries()).flatMap(([file, msgs]) => {
    const sf = program.getSourceFile(file);
    if (!sf) return [];

    return msgs.flatMap(mu => {
      const { start } = posOf(sf, mu);
      const node = findNodeAt(sf, start);
      const syms = defSymbols(checker, node);

      return syms.flatMap(sym => {
        const decls = sym.declarations ?? [];
        return decls.flatMap(decl => {
          const df = path.resolve(decl.getSourceFile().fileName);
          const dMsgs = byFile.get(df);
          if (!dMsgs || dMsgs.length === 0) return [];

          const ds = decl.getStart();
          const de = decl.getEnd();
          const dsf = program.getSourceFile(df);
          if (!dsf) return [];

          const found = dMsgs.find(dm => {
            const p = posOf(dsf, dm);
            return p.start >= ds && p.end <= de;
          });

          return found ? [[msgId(df, found), msgId(file, mu)] as const] : [];
        });
      });
    });
  });

  const importEdges = Array.from(byFile.entries()).flatMap(([file, msgs]) => {
    const sf = program.getSourceFile(file);
    return sf ? collectImportEdges(file, msgs, sf, program, byFile) : [];
  });

  return [...symbolEdges, ...importEdges];
};

const topoSortStep = (
  queue: ReadonlyArray<MsgId>,
  order: ReadonlyArray<MsgId>,
  succ: ReadonlyMap<MsgId, ReadonlySet<MsgId>>,
  indeg: ReadonlyMap<MsgId, number>
): ReadonlyArray<MsgId> => {
  if (queue.length === 0) return order;

  const u = queue[0]!;
  const restQueue = queue.slice(1);
  const newOrder = [...order, u];
  
  const successors = Array.from(succ.get(u) ?? []);
  const updates = successors.map(v => ({
    id: v,
    newDegree: (indeg.get(v) ?? 0) - 1
  }));

  const newIndeg = updates.reduce(
    (acc, { id, newDegree }) => new Map(acc).set(id, newDegree),
    indeg
  );

  const newZeroDegree = updates
    .filter(({ newDegree }) => newDegree === 0)
    .map(({ id }) => id);

  const nextQueue = [...restQueue, ...newZeroDegree].sort();

  return topoSortStep(nextQueue, newOrder, succ, newIndeg);
};

export const topoRank = (messages: ReadonlyArray<LintMessage & { readonly filePath: string }>, edges: ReadonlyArray<readonly [MsgId, MsgId]>): ReadonlyMap<MsgId, number> => {
  const ids: ReadonlyArray<MsgId> = messages.map(m => msgId(m.filePath, m));
  
  const initSucc: ReadonlyMap<MsgId, ReadonlySet<MsgId>> = new Map(
    ids.map(id => [id, new Set<MsgId>()])
  );
  
  const initIndeg: ReadonlyMap<MsgId, number> = new Map(
    ids.map(id => [id, 0])
  );

  const edgeUpdates = edges
    .filter(([u, v]) => initSucc.has(u) && initSucc.has(v))
    .filter(([u, v]) => !(initSucc.get(u)?.has(v) ?? false));

  const finalSucc = edgeUpdates.reduce(
    (acc, [u, v]) => {
      const oldSet = acc.get(u) ?? new Set<MsgId>();
      const newSet = new Set([...oldSet, v]);
      return new Map(acc).set(u, newSet);
    },
    initSucc
  );

  const finalIndeg = edgeUpdates.reduce(
    (acc, [_u, v]) => new Map(acc).set(v, (acc.get(v) ?? 0) + 1),
    initIndeg
  );

  const initialQueue = ids.filter(id => (finalIndeg.get(id) ?? 0) === 0).sort();
  const order = topoSortStep(initialQueue, [], finalSucc, finalIndeg);

  const missingIds = ids.filter(id => !order.includes(id));
  const completeOrder = [...order, ...missingIds];

  return new Map(completeOrder.map((id, i) => [id, i]));
};
