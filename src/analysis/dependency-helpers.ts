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
 * CHANGE: Use switch with proper type narrowing for discriminated unions
 * WHY: TypeScript requires explicit narrowing for union types to avoid unsafe access
 * QUOTE(ERROR): "Unsafe member access on error typed value"
 * REF: ESLint @typescript-eslint/no-unsafe-member-access
 *
 * @param filePath Путь к файлу
 * @param message Сообщение линтера
 * @returns Уникальный идентификатор
 */
export function createMessageId(
	filePath: string,
	message: LintMessageWithFile,
): MsgId {
	let ruleId: string;
	switch (message.source) {
		case "typescript": {
			ruleId = message.code;
			break;
		}
		case "eslint":
		case "biome": {
			ruleId = message.ruleId ?? "no-rule";
			break;
		}
		default: {
			ruleId = "no-rule";
			break;
		}
	}
	return `${path.resolve(filePath)}:${message.line}:${message.column}:${message.source}:${ruleId}`;
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
	// CHANGE: Use explicit numeric guard for end position instead of truthiness
	// WHY: strict-boolean-expressions — must handle nullish/zero/NaN explicitly; end positions are positive integers
	// QUOTE(TЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	// CHANGE: Use helper for end position validation to lower function complexity
	// WHY: reduce cyclomatic complexity; keep strict checks centralized
	// QUOTE(TЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	const hasEndPosition = isValidEndPosition(message);
	// CHANGE: Avoid referencing possibly undefined fields directly; compute via locals under guard
	// WHY: TS flagged 'message.endLine'/'message.endColumn' possibly undefined even after boolean guard
	// QUOTE(TЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	let end: number;
	if (hasEndPosition) {
		const endLine: number = message.endLine ?? 0;
		const endColumn: number = message.endColumn ?? 0;
		end = ts.getPositionOfLineAndCharacter(
			sourceFile,
			endLine - 1,
			Math.max(0, endColumn - 1),
		);
	} else {
		end = start;
	}
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
	// CHANGE: Avoid object truthiness check; symbol is non-nullable here
	// WHY: strict-boolean-expressions — object in conditional is always truthy; after the early return, symbol is a ts.Symbol
	// QUOTE(TЗ): "Исправить все ошибки линтера"
	// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
	return [symbol];
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

/**
 * Validates that endLine and endColumn are present and positive finite integers.
 *
 * @param msg Object possibly containing endLine/endColumn
 * @returns Type predicate ensuring both fields are valid numbers
 * @invariant endLine > 0 and endColumn > 0
 */
// CHANGE: Centralize end position validation
// WHY: Maintain single source of truth and reduce getPosition complexity
// QUOTE(TЗ): "Исправить все ошибки линтера"
// REF: REQ-LINT-FIX
export function isValidEndPosition(msg: {
	endLine?: number;
	endColumn?: number;
}): msg is { endLine: number; endColumn: number } {
	return (
		typeof msg.endLine === "number" &&
		typeof msg.endColumn === "number" &&
		Number.isFinite(msg.endLine) &&
		Number.isFinite(msg.endColumn) &&
		msg.endLine > 0 &&
		msg.endColumn > 0
	);
}
