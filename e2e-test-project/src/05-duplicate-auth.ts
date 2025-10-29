/**
 * ФАЙЛ С ДУБЛИРОВАННЫМ КОДОМ #2 - АУТЕНТИФИКАЦИЯ
 *
 * Этот файл содержит функции аутентификации с дублированным кодом
 * из других файлов для демонстрации обнаружения дубликатов
 */

/**
 * Валидация пользовательского ввода
 * ДУБЛИКАТ: Точно такая же функция как в 04-duplicate-validation.ts
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
 * Создание уникального ID
 * ДУБЛИКАТ: Точно такая же функция как в 04-duplicate-validation.ts
 */
export function generateUniqueId(): string {
	const timestamp = Date.now().toString(36);
	const randomPart = Math.random().toString(36).substring(2);
	const extraRandom = Math.random().toString(36).substring(2);

	return `${timestamp}-${randomPart}-${extraRandom}`;
}

/**
 * Обработка HTTP ошибок
 * ДУБЛИКАТ: Точно такой же блок как в других файлах duplicate-*.ts
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
 * Валидация пароля
 */
export function validatePassword(password: string): boolean {
	if (!password) {
		throw new Error("Password is required");
	}

	if (password.length < 8) {
		throw new Error("Password must be at least 8 characters long");
	}

	if (!/[A-Z]/.test(password)) {
		throw new Error("Password must contain at least one uppercase letter");
	}

	if (!/[a-z]/.test(password)) {
		throw new Error("Password must contain at least one lowercase letter");
	}

	if (!/\d/.test(password)) {
		throw new Error("Password must contain at least one digit");
	}

	return true;
}

/**
 * Создание токена аутентификации
 */
export function createAuthToken(
	userId: string,
	expiresIn: number = 3600,
): string {
	const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const payload = btoa(
		JSON.stringify({
			userId,
			exp: Math.floor(Date.now() / 1000) + expiresIn,
			iat: Math.floor(Date.now() / 1000),
		}),
	);

	// Простая подпись для демонстрации (в реальности используйте криптографические библиотеки)
	const signature = btoa(`${header}.${payload}.secret`);

	return `${header}.${payload}.${signature}`;
}

/**
 * Обработка входа пользователя
 */
export function processUserLogin(
	username: string,
	password: string,
): { token: string; userId: string } {
	try {
		// Валидация входных данных
		if (!validateUserInput(username)) {
			throw new Error("Invalid username");
		}

		if (!validatePassword(password)) {
			throw new Error("Invalid password");
		}

		// Генерация ID пользователя
		const userId = generateUniqueId();

		// Создание токена
		const token = createAuthToken(userId);

		logWithTimestamp(`User ${username} logged in successfully`);

		return { token, userId };
	} catch (error) {
		const httpError = { status: 401, message: "Authentication failed" };
		const errorMessage = handleHttpError(httpError);
		logWithTimestamp(errorMessage, "error");
		throw error;
	}
}

// Демонстрация использования
try {
	const loginResult = processUserLogin("testuser", "TestPassword123");
	logWithTimestamp(
		`Login successful, token: ${loginResult.token.substring(0, 20)}...`,
	);
} catch (error) {
	logWithTimestamp("Login failed", "error");
}
