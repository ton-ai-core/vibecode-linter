// ФАЙЛ С ДУБЛИРОВАННЫМ КОДОМ #1
// Этот файл содержит код, который дублируется в других файлах

/**
 * Валидация пользовательского ввода
 * ДУБЛИКАТ: Эта функция повторяется в duplicate-code-2.ts
 */
export function validateUserInput(input: string): boolean {
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

/**
 * Форматирование даты
 * ДУБЛИКАТ: Эта функция повторяется в duplicate-code-3.ts
 */
export function formatDate(date: Date): string {
	const day = date.getDate().toString().padStart(2, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const year = date.getFullYear();

	return `${day}/${month}/${year}`;
}

/**
 * Обработка HTTP ошибок
 * ДУБЛИКАТ: Этот блок повторяется в duplicate-code-2.ts и duplicate-code-3.ts
 */
export function handleHttpError(error: any): string {
	if (error.status === 404) {
		return "Resource not found";
	}

	if (error.status === 401) {
		return "Unauthorized access";
	}

	if (error.status === 500) {
		return "Internal server error";
	}

	return "Unknown error occurred";
}

/**
 * Логирование с временной меткой
 * ДУБЛИКАТ: Эта функция есть во всех файлах duplicate-code-*.ts
 */
function logWithTimestamp(message: string): void {
	const timestamp = new Date().toISOString();
	console.log(`[${timestamp}] ${message}`);
}

// Использование функций
const userInput = "test input";
if (validateUserInput(userInput)) {
	logWithTimestamp("User input validated successfully");
}

const today = new Date();
const formattedDate = formatDate(today);
logWithTimestamp(`Today's date: ${formattedDate}`);

// Симуляция HTTP ошибки
const mockError = { status: 404 };
const errorMessage = handleHttpError(mockError);
logWithTimestamp(`HTTP Error: ${errorMessage}`);
