// CHANGE: Extracted git utility functions from lint.ts
// WHY: Git helper functions should be in a separate module
// QUOTE(ТЗ): "Разбить lint.ts на подфайлы, каждый файл желательно должен быть не больше 300 строчек кода"
// REF: REQ-20250210-MODULAR-ARCH
// SOURCE: n/a

import type { DiffRangeConfig, ExecError } from "../types/index.js";
import { extractStdoutFromError } from "../types/index.js";
// CHANGE: Use node: protocol for Node.js built-in modules
// WHY: Biome lint rule requires explicit node: prefix for clarity
// REF: lint/style/useNodejsImportProtocol
// SOURCE: https://biomejs.dev/linter/rules/lint/style/useNodejsImportProtocol
import { exec, fs, path, promisify } from "../utils/node-mods.js";

const execAsync = promisify(exec);

/**
 * Получает фрагмент кода из рабочей директории вокруг указанной строки.
 *
 * @param filePath Путь к файлу
 * @param centerLine Центральная строка для контекста (1-based)
 * @param context Количество строк контекста с каждой стороны
 * @returns Массив отформатированных строк или null при ошибке
 */
export function getWorkspaceSnippet(
	filePath: string,
	centerLine: number,
	context = 2,
): ReadonlyArray<string> | null {
	try {
		const fileContent = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
		const start = Math.max(0, centerLine - context - 1);
		const end = Math.min(fileContent.length, centerLine + context);
		if (start >= end) {
			return null;
		}
		const snippet: string[] = [];
		for (let i = start; i < end; i += 1) {
			snippet.push(`${String(i + 1).padStart(4)} | ${fileContent[i] ?? ""}`);
		}
		return snippet;
	} catch {
		return null;
	}
}

/**
 * Получает фрагмент кода из указанного коммита вокруг указанной строки.
 *
 * @param commitHash Хэш коммита
 * @param filePath Путь к файлу
 * @param lineNumber Номер строки (1-based)
 * @param context Количество строк контекста с каждой стороны
 * @returns Массив отформатированных строк или null при ошибке
 */
export async function getCommitSnippetForLine(
	commitHash: string,
	filePath: string,
	lineNumber: number,
	context = 3,
): Promise<ReadonlyArray<string> | null> {
	const relativePath = path
		.relative(process.cwd(), filePath)
		.replace(/\\/g, "/");
	try {
		const { stdout } = await execAsync(
			`git show ${commitHash}:${relativePath}`,
		);
		const lines = stdout.split(/\r?\n/u);
		if (lineNumber <= 0 || lineNumber > lines.length) {
			return null;
		}
		const start = Math.max(0, lineNumber - context - 1);
		const end = Math.min(lines.length, lineNumber + context);
		const snippet: string[] = [];
		for (let i = start; i < end; i += 1) {
			snippet.push(`${String(i + 1).padStart(4)} | ${lines[i] ?? ""}`);
		}
		return snippet;
	} catch {
		return null;
	}
}

/**
 * Определяет диапазон для git diff (upstream...HEAD или HEAD).
 *
 * Проверяет наличие upstream ветки и возвращает соответствующую конфигурацию.
 *
 * @returns Конфигурация диапазона для git diff
 */
export async function detectDiffRange(): Promise<DiffRangeConfig> {
	try {
		const { stdout } = await execAsync(
			"git rev-parse --abbrev-ref --symbolic-full-name HEAD@{upstream}",
		);
		const upstream = stdout.trim();
		if (upstream.length > 0) {
			return {
				diffArg: `${upstream}...HEAD`,
				label: `${upstream}...HEAD`,
			};
		}
	} catch (error) {
		const execError = error as ExecError;
		// CHANGE: Avoid truthiness check on nullable string stderr
		// WHY: strict-boolean-expressions — handle nullish/empty explicitly
		// QUOTE(ТЗ): "Исправить все ошибки линтера"
		// REF: REQ-LINT-FIX, @typescript-eslint/strict-boolean-expressions
		if (typeof execError.stderr === "string" && execError.stderr.length > 0) {
			// Upstream is missing — fall back to local comparison
		}
	}
	return {
		diffArg: "HEAD",
		label: "HEAD",
	};
}

/**
 * Выполняет git-команду и возвращает stdout либо null.
 *
 * Инварианты:
 * - Не бросает исключение; при ошибке пытается извлечь stdout с помощью extractStdoutFromError.
 * - Возвращает null, если stdout отсутствует/пуст.
 *
 * @param command Команда git для выполнения
 * @param maxBuffer Максимальный размер буфера для stdout
 * @returns Строка stdout или null
 */
// CHANGE: Унифицированная обертка для устранения дублирования try/catch-паттерна
// WHY: jscpd указывал на повторяющиеся блоки с разбором stdout в нескольких модулях
// REF: REQ-LINT-FIX
export async function execGitStdoutOrNull(
	command: string,
	maxBuffer = 10 * 1024 * 1024,
): Promise<string | null> {
	try {
		const { stdout } = await execGitCommand(command, maxBuffer);
		return stdout;
	} catch (error) {
		const out = extractStdoutFromError(error as Error);
		return typeof out === "string" && out.length > 0 ? out : null;
	}
}

/**
 * Выполняет git-команду и возвращает непустой stdout или null.
 *
 * Инварианты:
 * - Использует execGitStdoutOrNull для безопасного извлечения stdout.
 * - Возвращает null, если stdout отсутствует или после trim() пуст.
 *
 * @param command Команда git для выполнения
 * @param maxBuffer Максимальный размер буфера для stdout
 * @returns Строка stdout (непустая) или null
 */
// CHANGE: Централизация проверки "непустого stdout" для устранения дублей
// WHY: jscpd фиксировал повторяющийся паттерн проверки длины/trim()
// QUOTE(ТЗ): "Убрать дубли кода"
// REF: REQ-LINT-FIX
export async function execGitNonEmptyOrNull(
	command: string,
	maxBuffer = 10 * 1024 * 1024,
): Promise<string | null> {
	const out = await execGitStdoutOrNull(command, maxBuffer);
	if (typeof out !== "string") return null;
	const trimmed = out.trim();
	return trimmed.length > 0 ? out : null;
}

/**
 * Выполняет команду git и возвращает результат.
 *
 * @param command Команда git для выполнения
 * @param maxBuffer Максимальный размер буфера для stdout
 * @returns Результат выполнения команды
 */
export async function execGitCommand(
	command: string,
	maxBuffer = 10 * 1024 * 1024,
): Promise<{ stdout: string; stderr: string }> {
	return await execAsync(command, { maxBuffer });
}
