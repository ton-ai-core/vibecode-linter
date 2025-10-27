// CHANGE: Created dependency checker module
// WHY: Need to verify required tools are installed before running linter
// QUOTE(USER): "Надо проверять установлены ли они. Если не установлены говорить об их установке"
// REF: user-request-check-dependencies
// SOURCE: n/a

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Информация о зависимости.
 */
interface Dependency {
	readonly name: string;
	readonly command: string;
	readonly checkCommand: string;
	readonly installCommand: string;
	readonly required: boolean;
}

/**
 * Список всех необходимых зависимостей.
 */
const DEPENDENCIES: readonly Dependency[] = [
	{
		name: "Git",
		command: "git",
		checkCommand: "git --version",
		installCommand: "Visit https://git-scm.com/downloads",
		required: true,
	},
	{
		name: "Node.js",
		command: "node",
		checkCommand: "node --version",
		installCommand: "Visit https://nodejs.org/",
		required: true,
	},
	{
		name: "ESLint",
		command: "eslint",
		checkCommand: "npx eslint --version",
		installCommand: "npm install",
		required: true,
	},
	{
		name: "Biome",
		command: "biome",
		checkCommand: "npx biome --version",
		installCommand: "npm install",
		required: true,
	},
	{
		name: "TypeScript",
		command: "tsc",
		checkCommand: "npx tsc --version",
		installCommand: "npm install",
		required: true,
	},
	{
		name: "jscpd",
		command: "jscpd",
		checkCommand: "npx jscpd --version",
		installCommand: "npm install",
		required: true,
	},
];

/**
 * Проверяет доступность команды.
 *
 * @param checkCommand Команда для проверки
 * @returns True если команда доступна
 */
async function isCommandAvailable(checkCommand: string): Promise<boolean> {
	try {
		await execAsync(checkCommand, { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Результат проверки зависимостей.
 */
interface DependencyCheckResult {
	readonly allAvailable: boolean;
	readonly missing: readonly Dependency[];
}

/**
 * Проверяет наличие всех необходимых зависимостей.
 *
 * @returns Результат проверки
 */
export async function checkDependencies(): Promise<DependencyCheckResult> {
	const missing: Dependency[] = [];

	for (const dep of DEPENDENCIES) {
		const available = await isCommandAvailable(dep.checkCommand);
		if (!available && dep.required) {
			missing.push(dep);
		}
	}

	return {
		allAvailable: missing.length === 0,
		missing,
	};
}

/**
 * Выводит информацию о недостающих зависимостях.
 *
 * @param missing Список недостающих зависимостей
 */
export function reportMissingDependencies(
	missing: readonly Dependency[],
): void {
	console.error("\n❌ Missing required dependencies:\n");

	for (const dep of missing) {
		console.error(`  • ${dep.name} (${dep.command})`);
		console.error(`    Check: ${dep.checkCommand}`);
		console.error(`    Install: ${dep.installCommand}\n`);
	}

	console.error("Please install the missing dependencies and try again.\n");
}
