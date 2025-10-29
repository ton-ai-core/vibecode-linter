import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	// Базовые конфигурации
	js.configs.recommended,
	...tseslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,

	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Строгие правила для демонстрации ошибок
			"no-var": "error",
			"prefer-const": "error",
			"no-unused-vars": "off", // Используем TypeScript версию
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-unsafe-assignment": "error",
			"@typescript-eslint/no-unsafe-member-access": "error",
			"@typescript-eslint/no-unsafe-call": "error",
			"@typescript-eslint/no-unsafe-return": "error",
			"@typescript-eslint/strict-boolean-expressions": "error",
			"@typescript-eslint/prefer-nullish-coalescing": "error",
			"@typescript-eslint/prefer-optional-chain": "error",

			// Стилистические правила
			"no-console": "warn",
			curly: "error",
			eqeqeq: "error",
			"no-duplicate-case": "error",
			"no-unreachable": "error",
			"no-empty": "error",
			"no-extra-boolean-cast": "error",

			// Функциональные правила
			"no-restricted-syntax": [
				"error",
				{
					selector: "SwitchStatement",
					message:
						"Switch statements are forbidden. Use ts-pattern match() instead for better type safety.",
				},
				{
					selector: "ForInStatement",
					message:
						"for..in loops iterate over the entire prototype chain. Use Object.keys() or for..of instead.",
				},
			],

			// Импорты
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["lodash", "lodash/*"],
							message:
								"Use native JavaScript methods or specific utility libraries instead of lodash.",
						},
					],
				},
			],
		},
	},

	// Специальные правила для тестовых файлов
	{
		files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"no-console": "off",
		},
	},
);
