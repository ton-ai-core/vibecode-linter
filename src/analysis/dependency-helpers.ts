// CHANGE: Extracted dependency analysis helpers
// WHY: Reduce file size and parameter count in main dependency module
// QUOTE(LINT): "File has too many lines (317). Maximum allowed is 300"
// REF: ESLint max-lines
// SOURCE: n/a

import * as path from "node:path";
import ts from "typescript";
import type { LintMessageWithFile } from "../types/index.js";

export type MsgId = string;

/**
 * Контекст для обработки зависимостей.
 *
 * CHANGE: Introduced context object to reduce parameter count
 * WHY: Functions were exceeding max-params limit (6 > 5)
 * QUOTE(LINT): "Function has too many parameters (6). Maximum allowed is 5"
 * REF: ESLint max-params
 * SOURCE: n/a
 */
export interface DependencyContext {
	readonly program: ts.Program;
	readonly checker: ts.TypeChecker;
	readonly byFile: Map<string, LintMessageWithFile[]>;
}

/**
 * Создает уникальный идентификатор для сообщения линтера.
 *
 * @param filePath Путь к файлу
 * @param message Сообщение линтера
 * @returns Уникальный идентификатор
 */
export function createMessageId(
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
 * Вычисляет позицию в исходном файле.
 *
 * @param sourceFile Исходный файл TypeScript
 * @param message Сообщение с информацией о позиции
 * @returns Начальная и конечная позиция
 */
export function getPosition(
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
 * Получает символы определения для узла.
 *
 * @param checker Type checker
 * @param node Узел AST
 * @returns Массив символов
 */
export function getDefinitionSymbols(
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
 * Группирует сообщения по файлам.
 *
 * @param messages Массив сообщений
 * @returns Карта файл -> сообщения
 */
export function groupMessagesByFile(
	messages: ReadonlyArray<LintMessageWithFile>,
): Map<string, LintMessageWithFile[]> {
	const byFile = new Map<string, LintMessageWithFile[]>();
	for (const message of messages) {
		const file = path.resolve(message.filePath);
		if (!byFile.has(file)) {
			byFile.set(file, []);
		}
		const fileMessages = byFile.get(file);
		if (fileMessages) fileMessages.push(message);
	}
	return byFile;
}

/**
 * Находит сообщение для декларации.
 *
 * @param declaration Декларация TypeScript
 * @param context Контекст обработки зависимостей
 * @returns Файл и сообщение или null
 */
export function findDeclarationMessage(
	declaration: ts.Declaration,
	context: DependencyContext,
): { readonly file: string; readonly message: LintMessageWithFile } | null {
	const declFile = path.resolve(declaration.getSourceFile().fileName);
	const declMessages = context.byFile.get(declFile);
	if (!declMessages || declMessages.length === 0) {
		return null;
	}

	const declStart = declaration.getStart();
	const declEnd = declaration.getEnd();
	const declSourceFile = context.program.getSourceFile(declFile);
	if (!declSourceFile) return null;

	const found = declMessages.find((dm) => {
		const pos = getPosition(declSourceFile, dm);
		return pos.start >= declStart && pos.end <= declEnd;
	});

	if (!found) return null;
	return { file: declFile, message: found };
}
