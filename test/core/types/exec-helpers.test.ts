// CHANGE: Add unit tests for extractStdoutFromError helper
// WHY: Achieve 100% coverage for error handling utilities
// QUOTE(ТЗ): "Надо дописать тесты что бы было 100% покрытие"
// REF: Coverage requirement for all CORE functions

import { describe, expect, it } from "vitest";
import { extractStdoutFromError } from "../../../src/core/types/exec-helpers.js";

describe("extractStdoutFromError", () => {
	it("returns stdout when error has valid stdout string", () => {
		const error = {
			message: "Command failed",
			stdout: "some output",
		};
		const result = extractStdoutFromError(error);
		expect(result).toBe("some output");
	});

	it("returns null when error has no stdout property (Error instance)", () => {
		const error = new Error("Command failed");
		const result = extractStdoutFromError(error);
		expect(result).toBeNull();
	});

	it("returns null when stdout is empty string", () => {
		const error = {
			message: "Command failed",
			stdout: "",
		};
		const result = extractStdoutFromError(error);
		expect(result).toBeNull();
	});

	it("returns null when stdout is whitespace only", () => {
		const error = {
			message: "Command failed",
			stdout: "   \n\t  ",
		};
		const result = extractStdoutFromError(error);
		expect(result).toBeNull();
	});

	it("returns stdout with trimmed whitespace preserved in content", () => {
		const error = {
			stdout: "  output with spaces  ",
		};
		const result = extractStdoutFromError(error);
		// trim() only checks if non-empty, doesn't return trimmed version
		expect(result).toBe("  output with spaces  ");
	});
});
