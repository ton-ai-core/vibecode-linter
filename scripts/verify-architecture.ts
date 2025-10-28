// CHANGE: Add automated architecture verification using ts-morph
// WHY: Ensure CORE never imports SHELL, enforce purity constraints
// QUOTE(ТЗ): "CORE никогда не вызывает SHELL"; "Зависимости: SHELL → CORE"
// REF: FCIS architectural rules from CLAUDE.md
// FORMAT THEOREM: ∀ file ∈ Core: dependencies(file) ⊆ PureModules
// PURITY: SHELL (reads filesystem via ts-morph)
// INVARIANT: Returns violations or empty array
// COMPLEXITY: O(n) where n = number of source files

import { Project, type SourceFile } from "ts-morph";

interface ArchitectureViolation {
	readonly file: string;
	readonly line: number;
	readonly rule: string;
	readonly message: string;
	readonly severity: "error" | "warning";
}

/**
 * Проверяет, что CORE файлы не импортируют SHELL
 *
 * @pure false - reads filesystem
 * @effect ts-morph AST analysis
 * @invariant ∀ f ∈ Core: imports(f) ∩ Shell = ∅
 * @complexity O(m) where m = number of imports in file
 */
function checkCoreImportsNoShell(
	sourceFile: SourceFile,
): readonly ArchitectureViolation[] {
	const filePath = sourceFile.getFilePath();

	// Only check files in /core/ directory
	if (!filePath.includes("/core/")) return [];

	const violations: ArchitectureViolation[] = [];

	for (const importDecl of sourceFile.getImportDeclarations()) {
		const moduleSpecifier = importDecl.getModuleSpecifierValue();

		// RULE: CORE must not import from SHELL
		if (moduleSpecifier.includes("/shell/")) {
			violations.push({
				file: filePath,
				line: importDecl.getStartLineNumber(),
				rule: "core-no-shell-imports",
				message: `CORE file imports SHELL: ${moduleSpecifier}`,
				severity: "error",
			});
		}

		// RULE: CORE must not import from APP
		if (moduleSpecifier.includes("/app/")) {
			violations.push({
				file: filePath,
				line: importDecl.getStartLineNumber(),
				rule: "core-no-app-imports",
				message: `CORE file imports APP: ${moduleSpecifier}`,
				severity: "error",
			});
		}
	}

	return violations;
}

/**
 * Проверяет наличие побочных эффектов в CORE функциях
 *
 * @pure false - reads filesystem
 * @effect ts-morph AST traversal
 * @invariant ∀ f ∈ CoreFunctions: ¬hasSideEffects(f)
 * @complexity O(n) where n = number of nodes in AST
 */
function checkCorePurity(
	sourceFile: SourceFile,
): readonly ArchitectureViolation[] {
	const filePath = sourceFile.getFilePath();

	// Only check files in /core/ directory
	if (!filePath.includes("/core/")) return [];

	const violations: ArchitectureViolation[] = [];

	// List of impure operations forbidden in CORE
	const impurePatterns = [
		{ pattern: "console.log", name: "console.log" },
		{ pattern: "console.error", name: "console.error" },
		{ pattern: "console.warn", name: "console.warn" },
		{ pattern: "process.exit", name: "process.exit" },
		{ pattern: "process.env", name: "process.env access" },
	];

	sourceFile.forEachDescendant((node) => {
		const text = node.getText();

		for (const { pattern, name } of impurePatterns) {
			if (text.includes(pattern)) {
				violations.push({
					file: filePath,
					line: node.getStartLineNumber(),
					rule: "core-purity",
					message: `CORE contains side effect: ${name}`,
					severity: "error",
				});
			}
		}
	});

	return violations;
}

/**
 * Проверяет наличие математических комментариев для функций
 *
 * @pure false - reads filesystem
 * @effect ts-morph AST analysis
 * @invariant ∀ f ∈ ExportedFunctions: hasDocumentation(f)
 * @complexity O(n) where n = number of exported functions
 */
function checkMathematicalComments(
	sourceFile: SourceFile,
): readonly ArchitectureViolation[] {
	const filePath = sourceFile.getFilePath();

	// Only check files in /core/ directory for stricter rules
	if (!filePath.includes("/core/")) return [];

	const violations: ArchitectureViolation[] = [];

	// Check exported functions have @pure, @invariant, @complexity tags
	for (const func of sourceFile.getFunctions()) {
		if (!func.isExported()) continue;

		const jsDoc = func.getJsDocs()[0];
		if (!jsDoc) {
			violations.push({
				file: filePath,
				line: func.getStartLineNumber(),
				rule: "mathematical-comments",
				message: `Function '${func.getName()}' lacks JSDoc with mathematical properties`,
				severity: "warning",
			});
			continue;
		}

		const docText = jsDoc.getFullText();
		const requiredTags = ["@pure", "@invariant", "@complexity"];
		const missingTags = requiredTags.filter((tag) => !docText.includes(tag));

		if (missingTags.length > 0) {
			violations.push({
				file: filePath,
				line: func.getStartLineNumber(),
				rule: "mathematical-comments",
				message: `Function '${func.getName()}' missing tags: ${missingTags.join(", ")}`,
				severity: "warning",
			});
		}
	}

	return violations;
}

/**
 * Проверяет, что APP не импортирует напрямую внешние зависимости
 *
 * @pure false - reads filesystem
 * @effect ts-morph AST analysis
 * @invariant ∀ f ∈ App: external_deps(f) ⊆ allowed_frameworks
 * @complexity O(m) where m = number of imports
 */
function checkAppLayerDependencies(
	sourceFile: SourceFile,
): readonly ArchitectureViolation[] {
	const filePath = sourceFile.getFilePath();

	// Only check files in /app/ directory
	if (!filePath.includes("/app/")) return [];

	const violations: ArchitectureViolation[] = [];

	// Allowed framework imports in APP layer
	const allowedFrameworks = ["effect", "ts-pattern"];

	for (const importDecl of sourceFile.getImportDeclarations()) {
		const moduleSpecifier = importDecl.getModuleSpecifierValue();

		// Check if it's an external dependency (not relative path)
		if (
			!moduleSpecifier.startsWith(".") &&
			!moduleSpecifier.startsWith("../")
		) {
			const isAllowed = allowedFrameworks.some((fw) =>
				moduleSpecifier.startsWith(fw),
			);

			// Allow imports from own @core modules
			if (
				moduleSpecifier.includes("/core/") ||
				moduleSpecifier.includes("/shell/")
			) {
				continue;
			}

			if (!isAllowed && !moduleSpecifier.startsWith("@")) {
				violations.push({
					file: filePath,
					line: importDecl.getStartLineNumber(),
					rule: "app-layer-dependencies",
					message: `APP layer imports unexpected external dependency: ${moduleSpecifier}`,
					severity: "warning",
				});
			}
		}
	}

	return violations;
}

/**
 * Запускает все проверки архитектуры
 *
 * @pure false - executes all checkers, exits process
 * @effect Program termination via process.exit
 * @invariant violations.length = 0 → exit(0), else exit(1)
 * @complexity O(n * m) where n = files, m = avg nodes per file
 */
async function verifyArchitecture(): Promise<void> {
	console.log("🔍 Verifying architecture rules...\n");

	const project = new Project({
		tsConfigFilePath: "tsconfig.json",
	});

	const allViolations: ArchitectureViolation[] = [];

	// Run all checks
	for (const sourceFile of project.getSourceFiles()) {
		// Skip node_modules
		if (sourceFile.getFilePath().includes("node_modules")) continue;

		allViolations.push(
			...checkCoreImportsNoShell(sourceFile),
			...checkCorePurity(sourceFile),
			...checkMathematicalComments(sourceFile),
			...checkAppLayerDependencies(sourceFile),
		);
	}

	// Report violations
	if (allViolations.length > 0) {
		const errors = allViolations.filter((v) => v.severity === "error");
		const warnings = allViolations.filter((v) => v.severity === "warning");

		if (errors.length > 0) {
			console.error("❌ Architecture ERRORS found:\n");
			for (const v of errors) {
				console.error(
					`  [ERROR] ${v.file}:${v.line}\n  Rule: ${v.rule}\n  ${v.message}\n`,
				);
			}
		}

		if (warnings.length > 0) {
			console.warn("⚠️  Architecture WARNINGS found:\n");
			for (const v of warnings) {
				console.warn(
					`  [WARN] ${v.file}:${v.line}\n  Rule: ${v.rule}\n  ${v.message}\n`,
				);
			}
		}

		console.error(
			`\n📊 Total: ${errors.length} errors, ${warnings.length} warnings\n`,
		);

		if (errors.length > 0) {
			process.exit(1);
		}
	} else {
		console.log("✅ Architecture verification passed!");
		console.log("   All FCIS rules satisfied:");
		console.log("   - CORE does not import SHELL");
		console.log("   - CORE functions are pure");
		console.log("   - Functions have mathematical documentation");
	}
}

// Execute verification
await verifyArchitecture();
