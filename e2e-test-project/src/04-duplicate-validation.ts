/**
 * ФАЙЛ С ДУБЛИРОВАННЫМ КОДОМ #1 - ВАЛИДАЦИЯ
 *
 * Этот файл содержит функции валидации, которые дублируются
 * в других файлах для демонстрации обнаружения дубликатов
 */

/**
 * Валидация пользовательского ввода
 * ДУБЛИКАТ: Эта функция повторяется в 05-duplicate-auth.ts
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

	if (input.length < 3) {
		throw new Error("Input too short");
	}

	return true;
}

/**
 * Валидация email адреса
 * ДУБЛИКАТ: Эта функция повторяется в 06-duplicate-utils.ts
 */
export function validateEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	if (!email) {
		throw new Error("Email is required");
	}

	if (!emailRegex.test(email)) {
		throw new Error("Invalid email format");
	}

	if (email.length > 254) {
		throw new Error("Email too long");
	}

	return true;
}

/**
 * Форматирование даты
 * ДУБЛИКАТ: Эта функция повторяется в 06-duplicate-utils.ts
 */
export function formatDate(date: Date): string {
	const day = date.getDate().toString().padStart(2, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const year = date.getFullYear();

	return `${day}/${month}/${year}`;
}

/**
 * Обработка HTTP ошибок
 * ДУБЛИКАТ: Этот блок повторяется во всех файлах duplicate-*.ts
 */
export function handleHttpError(error: {
	status: number;
	message?: string;
}): string {
	if (error.status === 400) {
		return "Bad Request - Invalid input data";
	}

	if (error.status === 401) {
		return "Unauthorized - Authentication required";
	}

	if (error.status === 403) {
		return "Forbidden - Access denied";
	}

	if (error.status === 404) {
		return "Not Found - Resource not found";
	}

	if (error.status === 500) {
		return "Internal Server Error - Something went wrong";
	}

	if (error.status >= 500) {
		return "Server Error - Please try again later";
	}

	return `Unknown error: ${error.status}`;
}

/**
 * Логирование с временной меткой
 * ДУБЛИКАТ: Эта функция есть во всех файлах duplicate-*.ts
 */
function logWithTimestamp(
	message: string,
	level: "info" | "warn" | "error" = "info",
): void {
	const timestamp = new Date().toISOString();
	const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

	switch (level) {
		case "error":
			console.error(`${prefix} ${message}`);
			break;
		case "warn":
			console.warn(`${prefix} ${message}`);
			break;
		default:
			console.log(`${prefix} ${message}`);
	}
}

/**
 * Создание уникального ID
 * ДУБЛИКАТ: Эта функция повторяется в 05-duplicate-auth.ts
 */
export function generateUniqueId(): string {
	const timestamp = Date.now().toString(36);
	const randomPart = Math.random().toString(36).substring(2);
	const extraRandom = Math.random().toString(36).substring(2);

	return `${timestamp}-${randomPart}-${extraRandom}`;
}

// Использование функций для демонстрации
try {
	const userInput = "test@example.com";

	if (validateUserInput(userInput)) {
		logWithTimestamp("User input validation passed");
	}

	if (validateEmail(userInput)) {
		logWithTimestamp("Email validation passed");
	}

	const today = new Date();
	const formattedDate = formatDate(today);
	logWithTimestamp(`Today's date: ${formattedDate}`);

	const uniqueId = generateUniqueId();
	logWithTimestamp(`Generated ID: ${uniqueId}`);
} catch (error) {
	const httpError = { status: 400, message: "Validation failed" };
	const errorMessage = handleHttpError(httpError);
	logWithTimestamp(errorMessage, "error");
}
