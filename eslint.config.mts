// eslint.config.mjs
import js from "@eslint/js";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import suggestMembers from "@ton-ai-core/eslint-plugin-suggest-members";
import importX from "eslint-plugin-import-x";
import jestPlugin from "eslint-plugin-jest";
import jsonc from "eslint-plugin-jsonc";
import promisePlugin from "eslint-plugin-promise";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sql from "eslint-plugin-sql";
import sqlTemplate from "eslint-plugin-sql-template";
import typeormTS from "eslint-plugin-typeorm-typescript";
import unusedImports from "eslint-plugin-unused-imports";
import yml from "eslint-plugin-yml";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	// Игноры
	{
		ignores: [
			"dist/**",
			"build/**",
			".api",
			"*.json",
			"*.yml",
			"*.yaml",
			"*.config.js",
			"*.config.ts",
			"reports/**",
		],
	},

	// Основные TS-файлы
	{
		files: ["**/*.{ts,tsx}"],
		extends: [
			js.configs.recommended,
			...tseslint.configs.recommended,
			...tseslint.configs.recommendedTypeChecked,
		],
		plugins: {
			"@eslint-community/eslint-comments": eslintComments,
			jest: jestPlugin,
			"@ton-ai-core/suggest-members": suggestMembers,
			"typeorm-typescript": typeormTS,
			sql,
			"sql-template": sqlTemplate,
			"import-x": importX,
			"simple-import-sort": simpleImportSort,
			"unused-imports": unusedImports,
			promise: promisePlugin,
			jsonc,
			yml,
		},
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: { ...globals.node, ...globals.browser },
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
				projectService: true,
			},
		},
		settings: {
			// Резолверы для import-x: TS-алиасы + node:* core-модули
			"import-x/resolver": {
				typescript: {
					alwaysTryTypes: true,
					project: "./tsconfig.json",
				},
				node: {
					extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json", ".node"],
					preferBuiltins: true,
				},
			},
			"import-x/core-modules": [
				"node:fs",
				"node:path",
				"node:url",
				"node:crypto",
				"node:os",
				"node:stream",
				"node:http",
				"node:https",
				"node:buffer",
				"node:util",
			],
		},
		rules: {
			// Метрики/сложность
			complexity: ["error", 8],
			"max-lines-per-function": [
				"error",
				{ max: 50, skipBlankLines: true, skipComments: true },
			],
			"max-params": ["error", 5],
			"max-depth": ["error", 4],
			"max-lines": [
				"error",
				{ max: 300, skipBlankLines: true, skipComments: true },
			],

			// Архитектура/импорты
			"import-x/no-cycle": ["error", { maxDepth: 10 }],
			"no-restricted-imports": [
				"error",
				{
					patterns: ["src/domain/**"],
					paths: [
						{
							name: "src/domain",
							message:
								"Domain layer must not be imported by UI layer. Use domain/public-api instead.",
						},
					],
				},
			],

			// TS строгие правила
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/no-explicit-any": "error",
			// TS-версия с разрешением идиом
			"no-unused-expressions": "off",
			"@typescript-eslint/no-unused-expressions": [
				"error",
				{ allowShortCircuit: true, allowTernary: true },
			],
			"@typescript-eslint/explicit-function-return-type": "error",
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/no-unsafe-assignment": "error",
			"@typescript-eslint/no-unsafe-member-access": "error",
			"@typescript-eslint/no-unsafe-call": "error",
			"@typescript-eslint/no-unsafe-return": "error",
			"@typescript-eslint/switch-exhaustiveness-check": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/await-thenable": "error",
			"@typescript-eslint/no-misused-promises": "error",
			"@typescript-eslint/require-await": "error",
			"@typescript-eslint/no-unnecessary-type-assertion": "error",
			"@typescript-eslint/prefer-readonly": "error",
			"@typescript-eslint/prefer-as-const": "error",
			"@typescript-eslint/strict-boolean-expressions": "error",
			"@typescript-eslint/ban-ts-comment": [
				"error",
				{
					"ts-ignore": true,
					"ts-nocheck": true,
					"ts-expect-error": true,
					"ts-check": true,
				},
			],

			// Запрет верхнего типа unknown (типовой)
			"@typescript-eslint/no-restricted-types": [
				"error",
				{
					types: {
						unknown: {
							message:
								"Не используем 'unknown'. Уточни тип или наведи порядок в источнике данных.",
						},
					},
				},
			],

			// Сводный запрет синтаксиса (мутабельный тюпл)
			"no-restricted-syntax": [
				"error",
				{ selector: "TSUnknownKeyword", message: "Запрещено 'unknown'." },
				{
					selector: "SwitchStatement",
					message: [
						"Switch statements are forbidden in functional programming paradigm.",
						"How to fix: Use ts-pattern match() instead.",
						"Example:",
						"  import { match } from 'ts-pattern';",
						"  type Item = { type: 'this' } | { type: 'that' };",
						"  const result = match(item)",
						"    .with({ type: 'this' }, (it) => processThis(it))",
						"    .with({ type: 'that' }, (it) => processThat(it))",
						"    .exhaustive();",
					].join("\n"),
				},
				{
					selector: 'CallExpression[callee.name="require"]',
					message: "Avoid using require(). Use ES6 imports instead.",
				},
				{
					selector: "ThrowStatement > Literal:not([value=/^\\w+Error:/])",
					message:
						'Do not throw string literals or non-Error objects. Throw new Error("...") instead.',
				},
			],

			// catch var — не навязывать unknown
			"@typescript-eslint/use-unknown-in-catch-callback-variable": "off",

			// Бросать только Error
			"no-throw-literal": "off",
			"@typescript-eslint/only-throw-error": [
				"error",
				{ allowThrowingUnknown: false, allowThrowingAny: false },
			],

			// Комментарии
			"@eslint-community/eslint-comments/no-use": "error",
			"@eslint-community/eslint-comments/no-unlimited-disable": "error",
			"@eslint-community/eslint-comments/disable-enable-pair": "error",
			"@eslint-community/eslint-comments/no-unused-disable": "error",

			// Плагины проекта
			"@ton-ai-core/suggest-members/suggest-members": "error",
			"@ton-ai-core/suggest-members/suggest-imports": "error",
			"@ton-ai-core/suggest-members/suggest-module-paths": "error",

			// TypeORM
			"typeorm-typescript/enforce-column-types": ["error", { driver: "sqlite" }],
			"typeorm-typescript/enforce-relation-types": [
				"error",
				{ specifyUndefined: "always" },
			],
			"typeorm-typescript/enforce-consistent-nullability": [
				"error",
				{ specifyNullable: "always" },
			],

			// SQL
			"sql/format": ["warn", { ignoreTagless: true }],
			"sql/no-unsafe-query": ["error", { allowLiteral: false }],
			"sql-template/no-unsafe-query": "error",

			// Импорты и порядок
			"import-x/no-unresolved": "error",
			"import-x/no-duplicates": "error",
			"import-x/first": "error",
			"import-x/newline-after-import": "error",
			// избегаем конфликтов с Biome organizeImports
			"simple-import-sort/imports": "off",
			"simple-import-sort/exports": "off",

			// Чистка мусора
			"unused-imports/no-unused-imports": "error",
			"unused-imports/no-unused-vars": "off",

			// Промисы/глобалы
			"promise/param-names": "error",
			"promise/no-multiple-resolved": "error",
			"no-restricted-globals": ["error", "Reflect"],

			/* === ДОБАВЛЕННЫЕ ПРАВИЛА (в конце) === */
			"@typescript-eslint/array-type": ["error", { default: "array-simple" }],
			"arrow-body-style": ["error", "as-needed"],
			curly: ["error", "multi-line"],
			eqeqeq: ["error", "always", { null: "ignore" }],
			"@typescript-eslint/consistent-type-assertions": [
				"error",
				{ assertionStyle: "as" },
			],
			"@typescript-eslint/explicit-member-accessibility": [
				"error",
				{ accessibility: "no-public" },
			],
			"@typescript-eslint/no-inferrable-types": [
				"error",
				{ ignoreParameters: true, ignoreProperties: true },
			],
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{ disallowTypeAnnotations: false },
			],
			"@typescript-eslint/no-namespace": [
				"error",
				{ allowDeclarations: true },
			],
			"import-x/no-relative-packages": "error",
			"no-cond-assign": "error",
			"no-debugger": "error",
			"no-duplicate-case": "error",
			"no-unsafe-finally": "error",
			"no-var": "error",
			"object-shorthand": "error",
			"one-var": ["error", "never"],
			"prefer-arrow-callback": "error",
			"prefer-const": ["error", { destructuring: "all" }],
			radix: "error",
			"default-case": "error",
		},
	},

	// FCIS: CORE vs SHELL layer overrides
	{
		files: ["src/core/**/*.ts"],
		rules: {
			"no-console": "error",
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"node:*",
								"fs",
								"child_process",
								"os",
								"http",
								"https",
								"stream",
								"path",
								"url",
								"buffer",
								"process",
							],
							message:
								"CORE layer must be pure: no Node I/O modules or process",
						},
					],
				},
			],
			"no-restricted-globals": ["error", "process"],
		},
	},

	// Тесты
	{
		files: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}"],
		plugins: { jest: jestPlugin },
		languageOptions: {
			globals: { ...globals.jest },
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
				projectService: true,
			},
		},
		rules: {
			...(jestPlugin.configs.recommended?.rules ?? {}),
			"jest/expect-expect": "off",
			"jest/no-standalone-expect": "off",
		},
	},

	// JSON/JSONC
	{
		files: ["**/*.json", "**/*.jsonc"],
		plugins: { jsonc },
		rules: { "jsonc/sort-keys": "error" },
	},

	// YAML
	{
		files: ["**/*.{yml,yaml}"],
		plugins: { yml },
		rules: { "yml/sort-keys": "error" },
	},
);
