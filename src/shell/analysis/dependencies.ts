// CHANGE: Extracted dependency analysis from lint.ts
// WHY: TypeScript AST analysis should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// QUOTE(LINT): "A Node.js builtin module should be imported with the node: protocol"
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import * as path from "node:path";

import ts from "typescript";

import type { LintMessageWithFile } from "../../core/types/index.js";
import {
	createMessageId,
	type DependencyContext,
	findDeclarationMessage,
	getDefinitionSymbols,
	getPosition,
	groupMessagesByFile,
	type MsgId,
} from "./dependency-helpers.js";

/**
 * Создает TypeScript Program из tsconfig.json.
 *
 * @returns TypeScript Program или null при ошибке
 */
export function buildProgram(): ts.Program | null {
	try {
		const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
		const cfg = ts.readConfigFile(tsconfigPath, (fileName) =>
			ts.sys.readFile(fileName),
		);
		const parsed = ts.parseJsonConfigFileContent(
			cfg.config,
			ts.sys,
			path.dirname(tsconfigPath),
		);
		return ts.createProgram({
			rootNames: parsed.fileNames,
			options: parsed.options,
		});
	} catch {
		return null;
	}
}

/**
 * Находит узел AST по позиции.
 *
 * @param sourceFile Исходный файл TypeScript
 * @param position Позиция в файле
 * @returns Узел AST
 */
function getNodeAtPosition(
	sourceFile: ts.SourceFile,
	position: number,
): ts.Node {
	let node: ts.Node = sourceFile;
	const visit = (currentNode: ts.Node): void => {
		if (
			position >= currentNode.getStart(sourceFile) &&
			position < currentNode.getEnd()
		) {
			node = currentNode;
			ts.forEachChild(currentNode, visit);
		}
	};
	visit(sourceFile);

	// Walk up to a meaningful ancestor node
	// CHANGE: Make parent check explicit instead of truthiness
	// WHY: strict-boolean-expressions — object in conditional is always true/false; we must compare to undefined
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	while (
		node.parent !== undefined &&
		!ts.isIdentifier(node) &&
		!ts.isCallExpression(node) &&
		!ts.isPropertyAccessExpression(node) &&
		!ts.isElementAccessExpression(node)
	) {
		node = node.parent;
	}
	return node;
}

// CHANGE: Extracted helper to process declarations for a node
// CHANGE: Use context object instead of 6 parameters
// WHY: Reduces parameter count from 6 to 4 to satisfy max-params rule
// QUOTE(LINT): "Function has too many parameters (6). Maximum allowed is 5"
// REF: ESLint max-params
// SOURCE: n/a
function processNodeDeclarations(
	node: ts.Node,
	useMessage: LintMessageWithFile,
	file: string,
	context: DependencyContext,
): ReadonlyArray<readonly [MsgId, MsgId]> {
	const checker: ts.TypeChecker = context.checker;
	const symbols = getDefinitionSymbols(checker, node);
	const edges: Array<readonly [MsgId, MsgId]> = [];

	for (const symbol of symbols) {
		const declarations: readonly ts.Declaration[] = symbol.declarations ?? [];
		for (const declaration of declarations) {
			const result = findDeclarationMessage(declaration, context);
			if (result !== null) {
				const resultFile: string = result.file;
				const resultMessage: LintMessageWithFile = result.message;
				edges.push([
					createMessageId(resultFile, resultMessage),
					createMessageId(file, useMessage),
				]);
			}
		}
	}

	return edges;
}

// CHANGE: Use context object instead of multiple parameters
// WHY: Reduces parameter count to satisfy max-params rule
// QUOTE(LINT): "Function has too many parameters"
// REF: ESLint max-params
// SOURCE: n/a
function processImportDeclarations(
	sourceFile: ts.SourceFile,
	file: string,
	msgs: readonly LintMessageWithFile[],
	context: DependencyContext,
): ReadonlyArray<readonly [MsgId, MsgId]> {
	const edges: Array<readonly [MsgId, MsgId]> = [];
	const program: ts.Program = context.program;
	const byFile: Map<string, LintMessageWithFile[]> = context.byFile;

	sourceFile.forEachChild((node) => {
		if (
			!ts.isImportDeclaration(node) ||
			!ts.isStringLiteral(node.moduleSpecifier)
		) {
			return;
		}

		const spec = node.moduleSpecifier.text;
		const compilerOptions: ts.CompilerOptions = program.getCompilerOptions();
		const resolved = ts.resolveModuleName(
			spec,
			file,
			compilerOptions,
			ts.sys,
		).resolvedModule;
		if (!resolved) {
			return;
		}

		const target = path.resolve(resolved.resolvedFileName);
		const targetMessages = byFile.get(target);
		if (!targetMessages || targetMessages.length === 0) {
			return;
		}

		const firstMessage = targetMessages[0];
		// CHANGE: Explicit undefined check instead of truthiness
		// WHY: strict-boolean-expressions — object value in conditional is always true
		// QUOTE(ТЗ): "Исправить все ошибки линтера"
		// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
		if (firstMessage === undefined) return;
		const from = createMessageId(target, firstMessage);

		for (const useMessage of msgs) {
			edges.push([from, createMessageId(file, useMessage)]);
		}
	});

	return edges;
}

/**
 * Строит граф зависимостей между сообщениями.
 *
 * CHANGE: Refactored to reduce complexity and line count
 * WHY: Original function had 87 lines, complexity 14, and max-depth 5
 * QUOTE(LINT): "Function has too many lines/complexity/nesting"
 * REF: ESLint max-lines-per-function, complexity, max-depth
 * SOURCE: n/a
 *
 * @param messages Массив сообщений
 * @param program TypeScript Program
 * @returns Массив рёбер графа [from, to]
 */
export function buildDependencyEdges(
	messages: readonly LintMessageWithFile[],
	program: ts.Program,
): ReadonlyArray<readonly [MsgId, MsgId]> {
	const byFile = groupMessagesByFile(messages);
	const checker = program.getTypeChecker();
	const context: DependencyContext = { program, checker, byFile };
	const edges: Array<readonly [MsgId, MsgId]> = [];

	for (const [file, msgs] of byFile) {
		const sourceFile = program.getSourceFile(file);
		// CHANGE: Use explicit undefined check for SourceFile
		// WHY: strict-boolean-expressions — avoid object truthiness
		// QUOTE(ТЗ): "Исправить все ошибки линтера"
		// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
		if (sourceFile === undefined) {
			continue;
		}

		// Process declarations for each message
		for (const useMessage of msgs) {
			const { start } = getPosition(sourceFile, useMessage);
			const node = getNodeAtPosition(sourceFile, start);
			const declarationEdges = processNodeDeclarations(
				node,
				useMessage,
				file,
				context,
			);
			edges.push(...declarationEdges);
		}

		// Import fallback: prioritize errors from imported modules
		const importEdges = processImportDeclarations(
			sourceFile,
			file,
			msgs,
			context,
		);
		edges.push(...importEdges);
	}

	return edges;
}

// CHANGE: Extracted helper to initialize graph structures
// WHY: Reduces line count and complexity of topologicalSort
// QUOTE(LINT): "Function has too many lines (51). Maximum allowed is 50"
// REF: ESLint max-lines-per-function
// SOURCE: n/a
function initializeGraph(ids: readonly MsgId[]): {
	readonly successors: Map<MsgId, Set<MsgId>>;
	readonly inDegree: Map<MsgId, number>;
} {
	const successors = new Map<MsgId, Set<MsgId>>();
	const inDegree = new Map<MsgId, number>();

	for (const id of ids) {
		successors.set(id, new Set());
		inDegree.set(id, 0);
	}

	return { successors, inDegree };
}

// CHANGE: Extracted helper to build graph from edges
// WHY: Reduces complexity of topologicalSort
// QUOTE(LINT): "Function has a complexity of 18. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function buildGraphFromEdges(
	edges: ReadonlyArray<readonly [MsgId, MsgId]>,
	successors: Map<MsgId, Set<MsgId>>,
	inDegree: Map<MsgId, number>,
): void {
	for (const [u, v] of edges) {
		if (!successors.has(u) || !successors.has(v)) {
			continue;
		}
		const uSuccessors = successors.get(u);
		if (uSuccessors && !uSuccessors.has(v)) {
			uSuccessors.add(v);
			inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
		}
	}
}

// CHANGE: Extracted helper to perform Kahn's algorithm
// WHY: Reduces complexity of topologicalSort
// QUOTE(LINT): "Function has a complexity of 18. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function performKahnsAlgorithm(
	ids: readonly MsgId[],
	successors: Map<MsgId, Set<MsgId>>,
	inDegree: Map<MsgId, number>,
): MsgId[] {
	const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0).sort();
	const order: MsgId[] = [];

	// CHANGE: Handle possibly undefined shift() result explicitly
	// WHY: strict-boolean-expressions — avoid nullable string in conditional
	// QUOTE(ТЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	while (queue.length > 0) {
		const u = queue.shift();
		if (u === undefined) break;
		order.push(u);

		for (const v of successors.get(u) ?? []) {
			inDegree.set(v, (inDegree.get(v) ?? 0) - 1);
			if ((inDegree.get(v) ?? 0) === 0) {
				queue.push(v);
			}
		}
		queue.sort();
	}

	return order;
}

// CHANGE: Extracted helper to add remaining nodes
// WHY: Reduces complexity of topologicalSort
// QUOTE(LINT): "Function has a complexity of 18. Maximum allowed is 8"
// REF: ESLint complexity
// SOURCE: n/a
function addRemainingNodes(order: MsgId[], ids: readonly MsgId[]): MsgId[] {
	if (order.length === ids.length) {
		return order;
	}

	const result = [...order];
	for (const id of ids) {
		if (!order.includes(id)) {
			result.push(id);
		}
	}
	return result;
}

/**
 * Выполняет топологическую сортировку сообщений.
 *
 * CHANGE: Refactored to reduce complexity and line count
 * WHY: Original function had 51 lines and complexity 18
 * QUOTE(LINT): "Function has too many lines (51). Maximum allowed is 50"
 * REF: ESLint max-lines-per-function, complexity
 * SOURCE: n/a
 *
 * @param messages Массив сообщений
 * @param edges Рёбра графа зависимостей
 * @returns Карта: MsgId -> ранг в топологическом порядке
 */
export function topologicalSort(
	messages: readonly LintMessageWithFile[],
	edges: ReadonlyArray<readonly [MsgId, MsgId]>,
): Map<MsgId, number> {
	const ids: MsgId[] = messages.map((m) => createMessageId(m.filePath, m));
	const { successors, inDegree } = initializeGraph(ids);

	buildGraphFromEdges(edges, successors, inDegree);

	const order = performKahnsAlgorithm(ids, successors, inDegree);
	const finalOrder = addRemainingNodes(order, ids);

	return new Map(finalOrder.map((id, i) => [id, i]));
}
