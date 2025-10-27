import { deriveFileContentMetrics } from "../../../src/core/project/metrics.js";

describe("deriveFileContentMetrics", () => {
	it("returns zeros for empty content", () => {
		const metrics = deriveFileContentMetrics("", ".ts");
		expect(metrics).toEqual({ lines: 0, characters: 0, functions: 0 });
	});

	it("normalizes CRLF sequences when counting lines and characters", () => {
		const content = "alpha\r\nbeta\r\ngamma";
		const metrics = deriveFileContentMetrics(content, ".md");
		expect(metrics.lines).toBe(3);
		expect(metrics.characters).toBe("alpha\nbeta\ngamma".length);
		expect(metrics.functions).toBe(0);
	});

	it("counts all function-like nodes for supported extensions", () => {
		const code = [
			"function alpha() {}",
			"const beta = () => {}",
			"class Gamma {",
			"  method() {}",
			"  get value() { return 1; }",
			"  set value(v) { this._value = v; }",
			"}",
		].join("\n");
		const metrics = deriveFileContentMetrics(code, ".ts");
		expect(metrics.lines).toBe(7);
		expect(metrics.characters).toBe(code.length);
		expect(metrics.functions).toBe(5);
	});

	it("treats supported extensions case-insensitively", () => {
		const code = "const delta = () => 1;";
		const metrics = deriveFileContentMetrics(code, ".TS");
		expect(metrics.functions).toBe(1);
	});
});
