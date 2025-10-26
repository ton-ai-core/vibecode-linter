// CHANGE: Pure metrics derivation for project insights
// WHY: Shell must not embed parsing logic; metrics belong to CORE for testability
// QUOTE(ТЗ): "CORE: Исключительно чистые функции, неизменяемые данные, математические операции"
// REF: user-request-project-info
// SOURCE: n/a
// FORMAT THEOREM: ∀file content c → deriveFileContentMetrics(c) deterministically computes metrics(c)
// PURITY: CORE
// INVARIANT: No IO/side effects; deterministic outcomes for identical inputs
// COMPLEXITY: O(n) per file, where n = |content|

import ts from "typescript";

import type { FileContentMetrics } from "../types/project-info.js";

/**
 * Поддерживаемые расширения для парсинга функций.
 */
const FUNCTION_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
]);

/**
 * Соответствие расширениям ScriptKind TypeScript.
 */
const SCRIPT_KIND_BY_EXTENSION: Record<string, ts.ScriptKind> = {
	".ts": ts.ScriptKind.TS,
	".tsx": ts.ScriptKind.TSX,
	".js": ts.ScriptKind.JS,
	".jsx": ts.ScriptKind.JSX,
	".mjs": ts.ScriptKind.JS,
	".cjs": ts.ScriptKind.JS,
};

/**
 * CHANGE: Pure helper to count function-like nodes.
 * WHY: Needed for FileContentMetrics without touching filesystem.
 * QUOTE(ТЗ): "Каждая функция — это теорема."
 * REF: user-request-project-info
 * FORMAT THEOREM: ∀node ∈ AST: countFunctions(node) = Σ child counts + indicator(node)
 * PURITY: CORE
 * INVARIANT: Result ≥ 0; traversal covers entire AST exactly once
 * COMPLEXITY: O(m) where m = |nodes|
 */
function countFunctions(sourceFile: ts.SourceFile): number {
	let total = 0;
	const visit = (node: ts.Node): void => {
		if (
			ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node) ||
			ts.isMethodDeclaration(node) ||
			ts.isGetAccessor(node) ||
			ts.isSetAccessor(node)
		) {
			total += 1;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return total;
}

/**
 * CHANGE: Deterministically maps file extension to ScriptKind.
 * WHY: Ensures TypeScript parser receives consistent configuration.
 * QUOTE(ТЗ): "Строгая типизация внешних зависимостей"
 * REF: user-request-project-info
 * FORMAT THEOREM: ∀ext: scriptKind(ext) ∈ ScriptKind
 * PURITY: CORE
 * INVARIANT: Defaults to ScriptKind.TS when ext неизвестно
 * COMPLEXITY: O(1)
 */
function resolveScriptKind(extension: string): ts.ScriptKind {
	const lower = extension.toLowerCase();
	return SCRIPT_KIND_BY_EXTENSION[lower] ?? ts.ScriptKind.TS;
}

/**
 * CHANGE: Compute immutable metrics for a file's textual content.
 * WHY: Enables shell to build project summaries without duplicating parsing logic.
 * QUOTE(ТЗ): "Каждая функция — это теорема."
 * REF: user-request-project-info
 * SOURCE: n/a
 * FORMAT THEOREM: ∀content: metrics.lines ≥ 0 ∧ metrics.characters ≥ 0 ∧ metrics.functions ≥ 0
 * PURITY: CORE
 * INVARIANT: Metrics depend solely on (content, extension)
 * COMPLEXITY: O(n) per file where n = |content|
 */
export function deriveFileContentMetrics(
	content: string,
	extension: string,
): FileContentMetrics {
	const normalized = content.replace(/\r\n/g, "\n");
	const lines = normalized.length === 0 ? 0 : normalized.split("\n").length;
	const characters = normalized.length;

	const shouldParseFunctions = FUNCTION_EXTENSIONS.has(extension.toLowerCase());
	const functions = shouldParseFunctions
		? countFunctions(
				ts.createSourceFile(
					`anonymous${extension}`,
					normalized,
					ts.ScriptTarget.Latest,
					/* setParentNodes */ false,
					resolveScriptKind(extension),
				),
			)
		: 0;

	return {
		lines,
		characters,
		functions,
	};
}
