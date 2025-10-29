// ФАЙЛ С ОШИБКАМИ ESLINT
// Этот файл содержит намеренные нарушения правил ESLint

// no-var: Unexpected var, use let or const instead
const oldStyleVariable = "используем var вместо const/let";

// prefer-const: 'neverChanges' is never reassigned. Use 'const' instead of 'let'
const neverChanges = "это значение никогда не изменится";

// @typescript-eslint/no-unused-vars: 'unusedVariable' is defined but never used
const unusedVariable = "эта переменная не используется";

// @typescript-eslint/no-explicit-any: Unexpected any. Specify a different type
const anyType: any = "запрещённый any тип";

// no-console: Unexpected console statement
console.log("это console.log для демонстрации предупреждения");

// curly: Expected { after 'if' condition
if (true) console.log("нет фигурных скобок");

// eqeqeq: Expected '===' and instead saw '=='
const comparison = "5" == 5;

// no-duplicate-case: Duplicate case label
function switchExample(value: string) {
	switch (value) {
		case "a":
			return 1;
		case "b":
			return 2;
		case "a": // Дублированный case
			return 3;
		default:
			return 0;
	}
}

// no-unreachable: Unreachable code
function unreachableCode() {
	return "возвращаем значение";
	console.log("этот код недостижим"); // Недостижимый код
}

// no-restricted-syntax: Use ts-pattern match() instead of switch statements
function forbiddenSwitch(type: "user" | "admin") {
	switch (
		type // Запрещённый switch
	) {
		case "user":
			return "User access";
		case "admin":
			return "Admin access";
	}
}

export { oldStyleVariable, switchExample, unreachableCode, forbiddenSwitch };
