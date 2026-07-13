// CHANGE: Move test from test/core/utils/ to test/utils/ to match upstream convention
// WHY: Upstream has test/utils/ for utility tests (builders.ts, tempProject.ts)
// QUOTE(ТЗ): "Для библиотеки тестов я использую vitest"
// REF: Architecture plan - module-level unit tests
// PURITY: test (pure function under test, no mocks needed)

import { describe, expect, it } from "vitest";

import { makeResolvePackageManagerParams } from "../../src/core/utils/package-manager-params.js";

describe("makeResolvePackageManagerParams", () => {
	it("returns object with only cwd when selection is undefined", () => {
		const result = makeResolvePackageManagerParams("/some/cwd", undefined);

		expect(result).toEqual({ cwd: "/some/cwd" });
		expect("selection" in result).toBe(false);
	});

	it("returns object with cwd and selection when selection is provided", () => {
		const result = makeResolvePackageManagerParams("/some/cwd", "pnpm");

		expect(result).toEqual({ cwd: "/some/cwd", selection: "pnpm" });
	});

	it("preserves cwd when selection is provided", () => {
		const result = makeResolvePackageManagerParams("/abs/path", "npm");

		expect(result.cwd).toBe("/abs/path");
		expect(result.selection).toBe("npm");
	});

	it("is a pure function (no mutation of inputs)", () => {
		const cwd = "/x";
		const selection = "yarn" as const;

		const result1 = makeResolvePackageManagerParams(cwd, selection);
		const result2 = makeResolvePackageManagerParams(cwd, selection);

		expect(result1).toEqual(result2);
		expect(result1).not.toBe(result2);
	});

	it("handles explicit 'auto' selection by passing it through", () => {
		const result = makeResolvePackageManagerParams("/cwd", "auto");
		expect(result.selection).toBe("auto");
		expect(result.cwd).toBe("/cwd");
	});
});
