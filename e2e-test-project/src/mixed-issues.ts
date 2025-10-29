// ФАЙЛ СО СМЕШАННЫМИ ПРОБЛЕМАМИ
// Этот файл содержит различные типы ошибок одновременно

// TypeScript + ESLint ошибки
const mixedVariable: number = "строка вместо числа"; // no-var + TS2322

// Неиспользуемые переменные + плохое форматирование
const unusedFormatted = "плохо отформатировано и не используется";

// Функция с множественными проблемами
function problematicFunction(param: any, unused: string): any {
	// no-console + плохое форматирование
	console.log("Отладочное сообщение");

	// Недостижимый код + плохое форматирование
	return param;
	console.log("Этот код недостижим");
}

// Объект с проблемами типизации и форматирования
const problematicObject: { name: string; age: number } = {
	name: "John",
	age: "30", // TS2322: string не присваивается number
	email: "john@example.com", // TS2322: лишнее свойство
};

// Switch statement (запрещён) + плохое форматирование
function handleUserType(type: "admin" | "user" | "guest"): string {
	switch (type) {
		case "admin":
			return "Admin access";
		case "user":
			return "User access";
		case "guest":
			return "Guest access";
		default:
			return "Unknown";
	}
}

// Дублированная логика из других файлов
function duplicatedValidation(input: string): boolean {
	if (!input) {
		throw new Error("Input cannot be empty");
	}

	if (input.trim().length === 0) {
		throw new Error("Input cannot be whitespace only");
	}

	if (input.length > 100) {
		throw new Error("Input too long");
	}

	return true;
}

// Проблемы с null safety
function unsafeFunction(data: string[] | null): number {
	return data.length; // TS2531: data может быть null
}

// Смешанные операторы сравнения
const comparison1 = "5" == 5; // eqeqeq
const comparison2 = null === undefined; // Правильно
const comparison3 = 0 == ""; // eqeqeq

// Неправильное использование any
const anyData: any = fetchSomeData();
const typedData: string = anyData; // TS2322

function fetchSomeData(): unknown {
	return "some data";
}

// Экспорт с проблемами
export {
	mixedVariable,
	problematicFunction,
	problematicObject,
	handleUserType,
	duplicatedValidation,
	unsafeFunction,
};
