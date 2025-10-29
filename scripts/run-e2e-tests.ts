#!/usr/bin/env npx tsx

/**
 * CHANGE: E2E test runner script for comprehensive testing
 * WHY: Provide easy way to run all E2E tests and generate reports
 * QUOTE(ТЗ): "Создать удобный способ запуска всех E2E тестов"
 * REF: REQ-E2E-RUNNER
 * PURITY: SHELL - orchestrates test execution and reporting
 * INVARIANT: Runs all E2E test suites and provides summary
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// CHANGE: Comprehensive E2E test execution with reporting
// WHY: Ensure all aspects of vibecode-linter work correctly
// INVARIANT: All test suites pass or provide clear failure information

interface TestResult {
	name: string;
	passed: boolean;
	duration: number;
	output: string;
	error?: string;
}

interface E2EReport {
	timestamp: string;
	totalTests: number;
	passedTests: number;
	failedTests: number;
	totalDuration: number;
	results: TestResult[];
	linterDemo: {
		errorsFound: number;
		errorsFixed: number;
		duplicatesFound: number;
		performance: {
			analysisTime: number;
			linesPerSecond: number;
		};
	};
}

function runCommand(
	command: string,
	timeout = 60000,
): { output: string; exitCode: number; duration: number } {
	const startTime = Date.now();
	let output = "";
	let exitCode = 0;

	try {
		output = execSync(command, {
			encoding: "utf-8",
			stdio: "pipe",
			timeout,
		});
	} catch (error) {
		const execError = error as {
			stdout?: string;
			stderr?: string;
			status?: number;
		};
		output = execError.stdout ?? execError.stderr ?? "";
		exitCode = execError.status ?? 1;
	}

	return {
		output,
		exitCode,
		duration: Date.now() - startTime,
	};
}

function runTestSuite(suiteName: string, testFile: string): TestResult {
	console.log(`🧪 Running ${suiteName}...`);

	const result = runCommand(`npm test -- ${testFile}`, 120000); // 2 minute timeout

	return {
		name: suiteName,
		passed: result.exitCode === 0,
		duration: result.duration,
		output: result.output,
		error: result.exitCode !== 0 ? `Exit code: ${result.exitCode}` : undefined,
	};
}

function runLinterDemo(): E2EReport["linterDemo"] {
	console.log("🎬 Running linter demonstration...");

	const testProjectPath = "e2e-test-project/src";

	// Run basic analysis
	const analysisResult = runCommand(
		`npx tsx src/bin/vibecode-linter.ts ${testProjectPath}`,
	);

	// Extract metrics from output
	const errorsMatch = analysisResult.output.match(/Total: (\d+) errors/);
	const errorsFound = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;

	// Run with auto-fix
	const fixResult = runCommand(
		`npx tsx src/bin/vibecode-linter.ts ${testProjectPath} --fix`,
	);
	const fixedErrorsMatch = fixResult.output.match(/Total: (\d+) errors/);
	const errorsAfterFix = fixedErrorsMatch
		? parseInt(fixedErrorsMatch[1], 10)
		: 0;
	const errorsFixed = Math.max(0, errorsFound - errorsAfterFix);

	// Run duplicate detection
	const duplicateResult = runCommand(
		`npx tsx src/bin/vibecode-linter.ts ${testProjectPath} --duplicates`,
	);
	const duplicatesFound =
		duplicateResult.output.includes("duplicate") ||
		duplicateResult.output.includes("Clone detected")
			? 1
			: 0;

	// Calculate performance metrics
	const linesOfCode = countLinesOfCode(testProjectPath);
	const linesPerSecond = linesOfCode / (analysisResult.duration / 1000);

	return {
		errorsFound,
		errorsFixed,
		duplicatesFound,
		performance: {
			analysisTime: analysisResult.duration,
			linesPerSecond: Math.round(linesPerSecond * 100) / 100,
		},
	};
}

function countLinesOfCode(dirPath: string): number {
	let totalLines = 0;

	function countInDir(currentPath: string) {
		if (!fs.existsSync(currentPath)) return;

		const items = fs.readdirSync(currentPath);

		for (const item of items) {
			const itemPath = path.join(currentPath, item);
			const stat = fs.statSync(itemPath);

			if (stat.isDirectory()) {
				countInDir(itemPath);
			} else if (item.endsWith(".ts") || item.endsWith(".tsx")) {
				const content = fs.readFileSync(itemPath, "utf-8");
				totalLines += content.split("\n").length;
			}
		}
	}

	countInDir(dirPath);
	return totalLines;
}

function generateReport(
	results: TestResult[],
	linterDemo: E2EReport["linterDemo"],
): E2EReport {
	const passedTests = results.filter((r) => r.passed).length;
	const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

	return {
		timestamp: new Date().toISOString(),
		totalTests: results.length,
		passedTests,
		failedTests: results.length - passedTests,
		totalDuration,
		results,
		linterDemo,
	};
}

function printReport(report: E2EReport) {
	console.log("\n" + "=".repeat(60));
	console.log("🎯 E2E TEST RESULTS SUMMARY");
	console.log("=".repeat(60));

	console.log(`📅 Timestamp: ${report.timestamp}`);
	console.log(`🧪 Total Tests: ${report.totalTests}`);
	console.log(`✅ Passed: ${report.passedTests}`);
	console.log(`❌ Failed: ${report.failedTests}`);
	console.log(
		`⏱️  Total Duration: ${(report.totalDuration / 1000).toFixed(1)}s`,
	);

	console.log("\n📊 LINTER DEMONSTRATION:");
	console.log(`🔍 Errors Found: ${report.linterDemo.errorsFound}`);
	console.log(`🔧 Errors Fixed: ${report.linterDemo.errorsFixed}`);
	console.log(`🔄 Duplicates Found: ${report.linterDemo.duplicatesFound}`);
	console.log(
		`⚡ Analysis Time: ${(report.linterDemo.performance.analysisTime / 1000).toFixed(1)}s`,
	);
	console.log(
		`📈 Lines/Second: ${report.linterDemo.performance.linesPerSecond}`,
	);

	console.log("\n📋 TEST SUITE DETAILS:");
	for (const result of report.results) {
		const status = result.passed ? "✅" : "❌";
		const duration = (result.duration / 1000).toFixed(1);
		console.log(`${status} ${result.name} (${duration}s)`);

		if (!result.passed && result.error) {
			console.log(`   Error: ${result.error}`);
		}
	}

	console.log("\n" + "=".repeat(60));

	if (report.failedTests === 0) {
		console.log(
			"🎉 ALL TESTS PASSED! vibecode-linter is ready for production!",
		);
	} else {
		console.log(
			`⚠️  ${report.failedTests} test suite(s) failed. Check the details above.`,
		);
	}

	console.log("=".repeat(60));
}

function saveReport(report: E2EReport) {
	const reportsDir = "reports";
	if (!fs.existsSync(reportsDir)) {
		fs.mkdirSync(reportsDir, { recursive: true });
	}

	const reportPath = path.join(reportsDir, `e2e-report-${Date.now()}.json`);
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

	console.log(`📄 Report saved to: ${reportPath}`);
}

async function main() {
	console.log("🚀 Starting E2E Test Suite for vibecode-linter");
	console.log("=".repeat(60));

	const startTime = Date.now();

	// Define test suites
	const testSuites = [
		{ name: "Real Project Tests", file: "test/e2e/real-project.e2e.test.ts" },
		{ name: "Configuration Tests", file: "test/e2e/configuration.e2e.test.ts" },
		{ name: "Performance Tests", file: "test/e2e/performance.e2e.test.ts" },
		{ name: "CLI Tests", file: "test/e2e/cli.e2e.test.ts" },
	];

	// Run all test suites
	const results: TestResult[] = [];
	for (const suite of testSuites) {
		const result = runTestSuite(suite.name, suite.file);
		results.push(result);

		if (result.passed) {
			console.log(
				`✅ ${suite.name} passed in ${(result.duration / 1000).toFixed(1)}s`,
			);
		} else {
			console.log(
				`❌ ${suite.name} failed in ${(result.duration / 1000).toFixed(1)}s`,
			);
		}
	}

	// Run linter demonstration
	const linterDemo = runLinterDemo();

	// Generate and display report
	const report = generateReport(results, linterDemo);
	printReport(report);
	saveReport(report);

	const totalTime = Date.now() - startTime;
	console.log(`\n⏱️  Total execution time: ${(totalTime / 1000).toFixed(1)}s`);

	// Exit with appropriate code
	process.exit(report.failedTests > 0 ? 1 : 0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error("❌ E2E test runner failed:", error);
		process.exit(1);
	});
}
