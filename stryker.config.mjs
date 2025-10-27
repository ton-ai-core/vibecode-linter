// CHANGE: Introduce Stryker mutation testing configuration executed as part of CI.
// WHY: Mutation analysis guarantees that commits are validated by behavioural perturbations, catching tests that do not defend invariants.
// QUOTE(ТЗ): "Реализуй мне в CI/CD запуск mutation тестов на каждый комит"
// REF: UserMsg#3
// SOURCE: "Stryker Mutator Docs: https://stryker-mutator.io/docs/stryker-js/config-file"
// FORMAT THEOREM: ∀c ∈ Commits: (mutants(c) survive) → tests(c) inadequate
// PURITY: SHELL
// EFFECT: Effect<readonly MutationReport, never, MutationWorkspace>
// INVARIANT: coverageAnalysis = perTest ⇒ killed(mutant) ↔ failing(test)
// COMPLEXITY: O(M · T)/O(1), with M mutants and T Jest executions

/**
 * @type {import("@stryker-mutator/api/core").StrykerOptions}
 */
export default {
	packageManager: "npm",
	mutate: [
		"src/**/*.ts",
		"!src/**/*.test.ts",
		"!src/**/*.spec.ts",
		"!src/**/__tests__/**/*.ts",
		"!src/**/index.ts",
	],
	testRunner: "jest",
	coverageAnalysis: "perTest",
	reporters: ["clear-text", "html", "json"],
	checkers: ["typescript"],
	tsconfigFile: "tsconfig.test.json",
	maxConcurrentTestRunners: 4,
	ignoreStatic: true,
	thresholds: {
		high: 90,
		low: 70,
		break: 60,
	},
	jest: {
		configFile: "jest.config.mjs",
		enableFindRelatedTests: true,
		// CHANGE: Add explicit ESM configuration for Jest in Stryker sandbox
		// WHY: Stryker creates sandbox without package.json "type": "module"
		// REF: Cannot use import statement outside a module error in CI
		config: {
			preset: "ts-jest/presets/default-esm",
			extensionsToTreatAsEsm: [".ts"],
			transform: {
				"^.+\\.ts$": [
					"ts-jest",
					{
						useESM: true,
						tsconfig: {
							module: "NodeNext",
							moduleResolution: "NodeNext",
						},
					},
				],
			},
			moduleNameMapper: {
				"^(\\.{1,2}/.*)\\.js$": "$1",
			},
		},
	},
	tempDirName: ".stryker-tmp",
	timeoutFactor: 1.5,
	timeoutMS: 60000,
};
