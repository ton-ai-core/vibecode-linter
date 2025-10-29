// ФАЙЛ С ДУБЛИРОВАННЫМ КОДОМ #2
// Этот файл содержит дубликаты из duplicate-code-1.ts

/**
 * Валидация email адреса (другая функция)
 */
export function validateEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Валидация пользовательского ввода
 * ДУБЛИКАТ: Точно такая же функция как в duplicate-code-1.ts
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
 * Обработка HTTP ошибок
 * ДУБЛИКАТ: Точно такой же блок как в duplicate-code-1.ts и duplicate-code-3.ts
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

/**
 * Обработка пользователя
 */
export function processUser(userData: { email: string; name: string }): void {
	// Валидация email
	if (!validateEmail(userData.email)) {
		logWithTimestamp(`Invalid email: ${userData.email}`);
		return;
	}

	// Валидация имени
	if (!validateUserInput(userData.name)) {
		logWithTimestamp(`Invalid name: ${userData.name}`);
		return;
	}

	logWithTimestamp(`User processed: ${userData.name} (${userData.email})`);
}

// Использование функций
const user = {
	email: "test@example.com",
	name: "John Doe",
};

processUser(user);

// Обработка ошибки
const apiError = { status: 401 };
const errorMsg = handleHttpError(apiError);
logWithTimestamp(`API Error: ${errorMsg}`);
