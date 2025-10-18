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
			"dist",
			"build/**",
			".api",
			"*.json",
			"*.yml",
			"*.yaml",
			"lint.ts",
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
				typescript: { alwaysTryTypes: true },
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
			"complexity": ["warn", 8],                    // порог CCN
			"max-lines-per-function": ["warn", 50],       // лимит строк функции
			"max-params": ["warn", 5],
			"max-depth": ["warn", 4],
			// TS строгие правила
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-unused-expressions": "error",
			"@typescript-eslint/explicit-function-return-type": "error",
			"@typescript-eslint/no-unsafe-assignment": "error",
			"@typescript-eslint/no-unsafe-member-access": "error",
			"@typescript-eslint/no-unsafe-call": "error",
			"@typescript-eslint/no-unsafe-return": "error",
			"@typescript-eslint/switch-exhaustiveness-check": "error",
			"@typescript-eslint/ban-ts-comment": [
				"error",
				{
					"ts-ignore": true,
					"ts-nocheck": true,
					"ts-expect-error": true,
					"ts-check": true,
				},
			],
			// CHANGE: Запрет типа unknown через no-restricted-types
			// WHY: unknown — верхний тип; требует уточнения источника данных
			// QUOTE(ТЗ): "запрети `unknown` правилами"
			// REF: user message (запрос на запрет unknown)
			// SOURCE: https://typescript-eslint.io/rules/no-restricted-types/
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

			// CHANGE: AST-блокировка TSUnknownKeyword через no-restricted-syntax
			// WHY: Дополнительная страховка от использования unknown в любом виде
			// QUOTE(ТЗ): "AST-блокировка на всякий случай"
			// REF: user message (запрос на запрет unknown)
			// SOURCE: https://eslint.org/docs/latest/rules/no-restricted-syntax
			"no-restricted-syntax": [
				"error",
				{
					selector: "TSUnknownKeyword",
					message: "Запрещено 'unknown'.",
				},
			],

			// CHANGE: Отключаем навязывание unknown в Promise.catch
			// WHY: Позволяет типизировать .catch как Error вместо unknown
			// QUOTE(ТЗ): "Не навязывать `unknown` в Promise.catch"
			// REF: user message (запрос на запрет unknown)
			// SOURCE: https://typescript-eslint.io/rules/use-unknown-in-catch-callback-variable
			"@typescript-eslint/use-unknown-in-catch-callback-variable": "off",

			// CHANGE: Включаем только Error в throw, запрещаем unknown
			// WHY: Позволяет безопасно типизировать catch-блоки как Error
			// QUOTE(ТЗ): "Запрет бросать что угодно"
			// REF: user message (запрос на запрет unknown)
			// SOURCE: https://typescript-eslint.io/rules/only-throw-error
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
			"typeorm-typescript/enforce-column-types": [
				"error",
				{ driver: "sqlite" },
			],
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
			// CHANGE: Disable simple-import-sort to avoid conflicts with Biome organizeImports
			// WHY: ESLint simple-import-sort and Biome organizeImports run in parallel and overwrite each other
			// QUOTE(USER): "Можем ли мы отключить тогда это форматирование для eslint ?"
			// REF: user-request-disable-eslint-import-sort
			// SOURCE: n/a
			"simple-import-sort/imports": "off",
			"simple-import-sort/exports": "off",

			// Чистка мусора
			"unused-imports/no-unused-imports": "error",
			"unused-imports/no-unused-vars": [
				"error",
				{
					vars: "all",
					varsIgnorePattern: "^_",
					args: "after-used",
					argsIgnorePattern: "^_",
				},
			],

			// Промисы
			"promise/param-names": "error",
			"promise/no-multiple-resolved": "error",
			"no-restricted-globals": ["error", "Reflect"],

			// // Точечные запреты с пояснениями
			// "no-restricted-syntax": ["error",
			//   // Direct this.* writes
			//   {
			//     selector: "AssignmentExpression[left.type='MemberExpression'][left.object.type='ThisExpression']",
			//     message: [
			//       "Direct assignment to this.* is forbidden (side effect).",
			//       "How to fix: return a new value instead of mutating the instance.",
			//       "If a class is required, add withState(next) that returns a new instance."
			//     ].join("\n")
			//   },
			//   // Reflect.set(this, …)
			//   {
			//     selector: "CallExpression[callee.object.name='Reflect'][callee.property.name='set'][arguments.0.type='ThisExpression']",
			//     message: [
			//       "Do not write to 'this' via Reflect.set.",
			//       "How to fix: compute next = { ...state, [key]: value } and pass it forward."
			//     ].join("\n")
			//   },
			//   // Object.assign(this, …)
			//   {
			//     selector: "CallExpression[callee.object.name='Object'][callee.property.name='assign'][arguments.0.type='ThisExpression']",
			//     message: [
			//       "Object.assign(this, …) mutates the instance.",
			//       "How to fix: build a new snapshot and replace the instance via a factory."
			//     ].join("\n")
			//   },
			//   // Any Reflect usage (catch aliases, destructuring, etc.)
			//   {
			//     selector: "MemberExpression[object.name='Reflect']",
			//     message: [
			//       "Reflect API is prohibited here.",
			//       "How to fix: use pure, typed updates; never mutate shared objects."
			//     ].join("\n")
			//   },
			//   // JSON.stringify for logic or "safety"
			//   {
			//     selector: "CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
			//     message: [
			//       "Do not use JSON.stringify for control flow or 'safe stringify'. It can throw on BigInt/cycles.",
			//       "How to fix: create typed values directly.",
			//       "If logging only, wrap in safeJson(value) with a replacer for BigInt and cycle handling."
			//     ].join("\n")
			//   }
			// ],

			// // Целевые запреты с решениями
			// "no-restricted-properties": ["error",
			//   {
			//     object: "Reflect", property: "set",
			//     message: [
			//       "Do not use Reflect.set (mutation).",
			//       "How to fix:",
			//       "1) Return a new state: const next = { ...obj, [key]: value };",
			//       "2) In classes: expose withState(next) that creates a new instance.",
			//       "3) Many updates: use a pure builder (e.g., Immer produce)."
			//     ].join("\n")
			//   },
			//   {
			//     object: "Reflect", property: "apply",
			//     message: [
			//       "Do not use Reflect.apply for control flow.",
			//       "How to fix: call the function directly; avoid JSON-based branching."
			//     ].join("\n")
			//   },
			//   {
			//     object: "Reflect", property: "defineProperty",
			//     message: [
			//       "Do not change object structure.",
			//       "How to fix: construct a new object with the desired property."
			//     ].join("\n")
			//   },
			//   {
			//     object: "Reflect", property: "deleteProperty",
			//     message: [
			//       "Do not delete from existing objects.",
			//       "How to fix: const { doomed, ...next } = obj."
			//     ].join("\n")
			//   },
			//   {
			//     object: "Reflect", property: "setPrototypeOf",
			//     message: [
			//       "Do not mutate prototypes.",
			//       "How to fix: prefer composition over prototype changes."
			//     ].join("\n")
			//   },
			//   {
			//     object: "Reflect", property: "preventExtensions",
			//     message: [
			//       "Do not toggle mutability at runtime.",
			//       "How to fix: rely on types and pure constructors."
			//     ].join("\n")
			//   }
			// ],
		},
	},

	// I/O-слой: разрешаем ООП и более свободный стиль для адаптеров/интеграций
	// CHANGE: Раскомментировали блок для I/O слоя, добавили notification
	// WHY: notification/manager.ts — это I/O слой (Telegram), где ООП допустим
	// QUOTE(ТЗ): "функциональная парадигма" (для бизнес-логики, не I/O)
	// REF: lint errors в notification/manager.ts
	// SOURCE: n/a
	// {
	//   files: [
	//     "**/providers/**/*.ts",
	//     "**/exchanges/**/*.ts",
	//     "**/telegram/**/*.ts",
	//     "**/notification/**/*.ts",
	//     "**/config/**/*.ts",
	//     "**/database/**/*.ts",
	//     "src/app/bootstrap.ts",
	//     "src/app/main.ts",
	//   ],
	//   rules: {
	//     "functional/no-classes": "off",
	//     "functional/no-class-inheritance": "off",
	//     "functional/no-this-expressions": "off",
	//     "functional/no-loop-statements": "off",
	//     "functional/immutable-data": "off",
	//     "functional/no-let": "off",
	//     "functional/functional-parameters": "off",
	//     "functional/no-try-statements": "off",
	//     "no-restricted-syntax": "off",
	//   },
	// },

	// Тесты
	{
		files: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}"],
		plugins: { jest: jestPlugin },
		languageOptions: { globals: { ...globals.jest } },
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
