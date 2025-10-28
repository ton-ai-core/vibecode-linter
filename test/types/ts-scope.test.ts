import * as fs from "node:fs";
import * as path from "node:path";
import { Effect } from "effect";
import { getTypeScriptDiagnostics } from "../../src/shell/linters/index.js";

// CHANGE: Deterministic test that our TS diagnostics respect targetPath scope
// WHY: Verify that diagnostics come strictly from the passed subtree and reflect tsconfig.json semantics
// QUOTE(ТЗ): "Исходить из того, что описано в tsconfig.json; применять именно эти правила"
// REF: REQ-TS-SOLUTION-STYLE, REQ-LINT-FIX
// FORMAT THEOREME:
// Let D(T) be diagnostics(getTypeScriptDiagnostics(T)) where T is a directory under test/.
// If we create file bad.ts ∈ T with `const n: number = undefined`, then under strictNullChecks we must observe
// ∃ m ∈ D(T): m.code = TS2322 ∧ m.filePath endsWith "bad.ts". Also, for S = "src/", ∀ m ∈ D(S): ¬ m.filePath endsWith "bad.ts".

function mkdirp(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

describe("TypeScript diagnostics scope (solution-style tsconfig, NodeNext)", () => {
	const fixtureDir = path.join(process.cwd(), "test", "fixtures", "ts-scope");
	const badFile = path.join(fixtureDir, "bad.ts");

	beforeAll(() => {
		mkdirp(fixtureDir);
		// Ensure clean state before assertions
		if (fs.existsSync(badFile)) {
			fs.unlinkSync(badFile);
		}
	});

	afterAll(() => {
		// Cleanup the created file but keep fixtures dir for determinism
		if (fs.existsSync(badFile)) {
			fs.unlinkSync(badFile);
		}
	});

	test("returns TS errors strictly from the provided test subtree", () => {
		// CHANGE: Remove async/await, use pure Effect.runPromise return
		// WHY: Functional paradigm forbids async/await - use Effect composition
		// PURITY: SHELL - contains file system effects
		// EFFECT: Effect<void, never, never>

		// Arrange: create a deliberate type error under test/ (strict typing applies from tsconfig.base.json)
		fs.writeFileSync(badFile, 'const n: number = "x";\n', {
			encoding: "utf-8",
		});

		// Act & Assert: Use Effect.runPromise to execute Effect-based linter
		return Effect.runPromise(
			Effect.gen(function* (_) {
				const msgs = yield* _(getTypeScriptDiagnostics(badFile));

				// Assert: at least one TS2322 reported for bad.ts in the requested subtree
				expect(msgs.length).toBeGreaterThan(0);
				const hasTS2322 = msgs.some(
					(m) =>
						m.code === "TS2322" &&
						(m.filePath.endsWith("bad.ts") || m.filePath.endsWith("bad.tsx")),
				);
				expect(hasTS2322).toBe(true);
			}),
		);
	});

	test("does not leak test/ diagnostics into src/ scope", () =>
		// CHANGE: Remove async/await, use pure Effect.runPromise return
		// WHY: Functional paradigm forbids async/await - use Effect composition
		// PURITY: SHELL - contains file system effects
		// EFFECT: Effect<void, never, never>

		// Act & Assert: Use Effect.runPromise to execute Effect-based linter
		Effect.runPromise(
			Effect.gen(function* (_) {
				const msgs = yield* _(getTypeScriptDiagnostics("src/"));

				// Assert: diagnostics from bad.ts must not appear when scoping to src/
				const leaked = msgs.some(
					(m) =>
						m.filePath.endsWith("bad.ts") || m.filePath.endsWith("bad.tsx"),
				);
				expect(leaked).toBe(false);
			}),
		));
});
