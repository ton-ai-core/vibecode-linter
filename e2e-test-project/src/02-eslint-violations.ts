/**
 * ФАЙЛ С НАРУШЕНИЯМИ ПРАВИЛ ESLINT
 *
 * Этот файл демонстрирует различные нарушения правил ESLint,
 * которые должны быть обнаружены vibecode-linter
 */

// ❌ no-var: Unexpected var, use let or const instead
const oldStyleVariable = "используем устаревший var";
const anotherVar = 42;

// ❌ prefer-const: 'neverChanges' is never reassigned. Use 'const' instead of 'let'
const neverChanges = "это значение никогда не изменится";
const alsoNeverChanges = [1, 2, 3];

// ❌ @typescript-eslint/no-unused-vars: 'unusedVariable' is defined but never used
const unusedVariable = "эта переменная не используется";
const anotherUnusedVar = { data: "unused" };
const unusedLet = "also unused";

// ❌ @typescript-eslint/no-explicit-any: Unexpected any. Specify a different type
const anyType: any = "запрещённый any тип";
function acceptsAny(param: any): any {
	return param;
}
const anyArray: any[] = [1, "string", true];

// ❌ no-console: Unexpected console statement
console.log("Это console.log для демонстрации предупреждения");
console.error("Ошибка в консоли");
console.warn("Предупреждение в консоли");

// ❌ curly: Expected { after 'if' condition
if (true) console.log("нет фигурных скобок в if");

// ❌ Функция с проблемами
function problematicFunction() {
	if (false) return "early return без скобок";
	return "default";
}

// ❌ eqeqeq: Expected '===' and instead saw '=='
const looseComparison1 = "5" == 5;
const looseComparison2 = null == undefined;
const looseComparison3 = 0 == false;

// ❌ no-duplicate-case: Duplicate case label
function switchWithDuplicates(value: string): string {
	switch (value) {
		case "a":
			return "first a";
		case "b":
			return "b case";
		case "a": // Дублированный case
			return "second a";
		case "c":
			return "c case";
		default:
			return "default";
	}
}

// ❌ no-unreachable: Unreachable code
function unreachableCodeExample(): string {
	return "возвращаем значение";
	console.log("этот код недостижим"); // Недостижимый код
	const unreachableVar = "тоже недостижимо";
	return "второй return тоже недостижим";
}

// ❌ no-empty: Empty block statement
function emptyBlocks(): void {
	if (true) {
		// Пустой блок
	}

	try {
		throw new Error("test");
	} catch (e) {
		// Пустой catch блок
	}

	for (let i = 0; i < 10; i++) {
		// Пустой цикл
	}
}

// ❌ no-extra-boolean-cast: Redundant Boolean call
const redundantBoolean1 = Boolean(true);
const redundantBoolean2 = !!true;
if (someCondition) {
	// излишнее приведение к boolean
}

// ❌ no-restricted-syntax: Switch statements are forbidden
function forbiddenSwitch(type: "user" | "admin" | "guest"): string {
	switch (
		type // Запрещённый switch statement
	) {
		case "user":
			return "User access";
		case "admin":
			return "Admin access";
		case "guest":
			return "Guest access";
		default:
			return "Unknown";
	}
}

// ❌ no-restricted-syntax: for..in loops are forbidden
function forbiddenForIn(obj: Record<string, unknown>): void {
	for (const key in obj) {
		// Запрещённый for..in
		console.log(key, obj[key]);
	}
}

// ❌ @typescript-eslint/no-unsafe-assignment
function unsafeOperations(): void {
	const anyValue: any = { data: "test" };
	const unsafeAssignment = anyValue.someProperty; // unsafe assignment
	const anotherUnsafe = anyValue.nested.deep.property; // unsafe member access

	// ❌ @typescript-eslint/no-unsafe-call
	anyValue.someMethod(); // unsafe call
	anyValue.nested.method(1, 2, 3); // unsafe call

	// ❌ @typescript-eslint/no-unsafe-return
	return anyValue.someValue; // unsafe return
}

// ❌ @typescript-eslint/strict-boolean-expressions
function strictBooleanViolations(value: string | null): void {
	if (value) {
		// Should be: if (value !== null)
		console.log("value exists");
	}

	const result = value || "default"; // Should use nullish coalescing
	const another = value && value.length; // Should use optional chaining
}

// Вспомогательная переменная для демонстрации
const someCondition = true;

export {
	oldStyleVariable,
	neverChanges,
	anyType,
	acceptsAny,
	switchWithDuplicates,
	unreachableCodeExample,
	emptyBlocks,
	forbiddenSwitch,
	forbiddenForIn,
	unsafeOperations,
	strictBooleanViolations,
	someCondition,
};
