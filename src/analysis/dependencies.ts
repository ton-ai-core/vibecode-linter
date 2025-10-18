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

import type { LintMessageWithFile } from "../types/index.js";

type MsgId = string;

/**
 * Создает уникальный идентификатор для сообщения линтера.
 *
 * @param filePath Путь к файлу
 * @param message Сообщение линтера
 * @returns Уникальный идентификатор
 */
function createMessageId(
	filePath: string,
	message: LintMessageWithFile,
): MsgId {
	const ruleId =
		message.source === "typescript"
			? message.code
			: "ruleId" in message
				? message.ruleId
				: "no-rule";
	return `${path.resolve(filePath)}:${message.line}:${message.column}:${message.source}:${ruleId ?? "no-rule"}`;
}

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
 * Вычисляет позицию в исходном файле.
 *
 * @param sourceFile Исходный файл TypeScript
 * @param message Сообщение с информацией о позиции
 * @returns Начальная и конечная позиция
 */
function getPosition(
	sourceFile: ts.SourceFile,
	message: {
		line: number;
		column: number;
		endLine?: number;
		endColumn?: number;
	},
): { start: number; end: number } {
	const start = ts.getPositionOfLineAndCharacter(
		sourceFile,
		Math.max(0, message.line - 1),
		Math.max(0, message.column - 1),
	);
	const end =
		message.endLine && message.endColumn
			? ts.getPositionOfLineAndCharacter(
					sourceFile,
					message.endLine - 1,
					Math.max(0, message.endColumn - 1),
				)
			: start;
	return { start, end };
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
	while (
		node.parent &&
		!ts.isIdentifier(node) &&
		!ts.isCallExpression(node) &&
		!ts.isPropertyAccessExpression(node) &&
		!ts.isElementAccessExpression(node)
	) {
		node = node.parent;
	}
	return node;
}

/**
 * Получает символы определения для узла.
 *
 * @param checker Type checker
 * @param node Узел AST
 * @returns Массив символов
 */
function getDefinitionSymbols(
	checker: ts.TypeChecker,
	node: ts.Node,
): ReadonlyArray<ts.Symbol> {
	const locus = ts.isIdentifier(node)
		? node
		: ts.isPropertyAccessExpression(node)
			? node.name
			: ts.isElementAccessExpression(node)
				? node.argumentExpression
				: node;
	const symbol0 = checker.getSymbolAtLocation(locus);
	if (!symbol0) {
		return [];
	}
	const symbol =
		symbol0.getFlags() & ts.SymbolFlags.Alias
			? checker.getAliasedSymbol(symbol0)
			: symbol0;
	return symbol ? [symbol] : [];
}

/**
 * Строит граф зависимостей между сообщениями.
 *
 * @param messages Массив сообщений
 * @param program TypeScript Program
 * @returns Массив рёбер графа [from, to]
 */
export function buildDependencyEdges(
	messages: ReadonlyArray<LintMessageWithFile>,
	program: ts.Program,
): ReadonlyArray<readonly [MsgId, MsgId]> {
	const byFile = new Map<string, LintMessageWithFile[]>();
	for (const message of messages) {
		const file = path.resolve(message.filePath);
		if (!byFile.has(file)) {
			byFile.set(file, []);
		}
		const fileMessages = byFile.get(file);
		if (fileMessages) fileMessages.push(message);
	}

	const checker = program.getTypeChecker();
	const edges: Array<readonly [MsgId, MsgId]> = [];

	for (const [file, msgs] of byFile) {
		const sourceFile = program.getSourceFile(file);
		if (!sourceFile) {
			continue;
		}

		for (const useMessage of msgs) {
			const { start } = getPosition(sourceFile, useMessage);
			const node = getNodeAtPosition(sourceFile, start);
			const symbols = getDefinitionSymbols(checker, node);

			for (const symbol of symbols) {
				const declarations = symbol.declarations ?? [];
				for (const declaration of declarations) {
					const declFile = path.resolve(declaration.getSourceFile().fileName);
					const declMessages = byFile.get(declFile);
					if (!declMessages || declMessages.length === 0) {
						continue;
					}

					const declStart = declaration.getStart();
					const declEnd = declaration.getEnd();
					const declSourceFile = program.getSourceFile(declFile);
					if (!declSourceFile) continue;
					const found = declMessages.find((dm) => {
						const pos = getPosition(declSourceFile, dm);
						return pos.start >= declStart && pos.end <= declEnd;
					});
					if (found) {
						edges.push([
							createMessageId(declFile, found),
							createMessageId(file, useMessage),
						]);
					}
				}
			}
		}

		// Import fallback: prioritize errors from imported modules
		sourceFile.forEachChild((node) => {
			if (
				ts.isImportDeclaration(node) &&
				ts.isStringLiteral(node.moduleSpecifier)
			) {
				const spec = node.moduleSpecifier.text;
				const resolved = ts.resolveModuleName(
					spec,
					file,
					program.getCompilerOptions(),
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
				if (!firstMessage) return;
				const from = createMessageId(target, firstMessage);
				for (const useMessage of msgs) {
					edges.push([from, createMessageId(file, useMessage)]);
				}
			}
		});
	}
	return edges;
}

/**
 * Выполняет топологическую сортировку сообщений.
 *
 * @param messages Массив сообщений
 * @param edges Рёбра графа зависимостей
 * @returns Карта: MsgId -> ранг в топологическом порядке
 */
export function topologicalSort(
	messages: ReadonlyArray<LintMessageWithFile>,
	edges: ReadonlyArray<readonly [MsgId, MsgId]>,
): Map<MsgId, number> {
	const ids: MsgId[] = messages.map((m) => createMessageId(m.filePath, m));
	const successors = new Map<MsgId, Set<MsgId>>();
	const inDegree = new Map<MsgId, number>();

	for (const id of ids) {
		successors.set(id, new Set());
		inDegree.set(id, 0);
	}

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

	const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0).sort();
	const order: MsgId[] = [];

	while (queue.length > 0) {
		const u = queue.shift();
		if (!u) break;
		order.push(u);
		for (const v of successors.get(u) ?? []) {
			inDegree.set(v, (inDegree.get(v) ?? 0) - 1);
			if ((inDegree.get(v) ?? 0) === 0) {
				queue.push(v);
			}
		}
		queue.sort();
	}

	// Add remaining nodes (cycles)
	if (order.length !== ids.length) {
		for (const id of ids) {
			if (!order.includes(id)) {
				order.push(id);
			}
		}
	}

	return new Map(order.map((id, i) => [id, i]));
}
