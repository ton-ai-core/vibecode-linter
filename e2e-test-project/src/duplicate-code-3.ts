// ФАЙЛ С ДУБЛИРОВАННЫМ КОДОМ #3
// Этот файл содержит дубликаты из других файлов

/**
 * Форматирование даты
 * ДУБЛИКАТ: Точно такая же функция как в duplicate-code-1.ts
 */
export function formatDate(date: Date): string {
	const day = date.getDate().toString().padStart(2, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const year = date.getFullYear();

	return `${day}/${month}/${year}`;
}

/**
 * Обработка HTTP ошибок
 * ДУБЛИКАТ: Точно такой же блок как в duplicate-code-1.ts и duplicate-code-2.ts
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
 * Форматирование времени
 */
export function formatTime(date: Date): string {
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");
	const seconds = date.getSeconds().toString().padStart(2, "0");

	return `${hours}:${minutes}:${seconds}`;
}

/**
 * Создание отчёта
 */
export function generateReport(data: any[]): string {
	const timestamp = new Date();
	const dateStr = formatDate(timestamp);
	const timeStr = formatTime(timestamp);

	logWithTimestamp(`Generating report for ${data.length} items`);

	let report = `Report generated on ${dateStr} at ${timeStr}\n`;
	report += `Total items: ${data.length}\n`;
	report += "=" * 50 + "\n";

	data.forEach((item, index) => {
		report += `${index + 1}. ${JSON.stringify(item)}\n`;
	});

	return report;
}

// Использование функций
const reportData = [
	{ id: 1, name: "Item 1" },
	{ id: 2, name: "Item 2" },
	{ id: 3, name: "Item 3" },
];

const report = generateReport(reportData);
logWithTimestamp("Report generated successfully");

// Обработка ошибки
const serverError = { status: 500 };
const errorDescription = handleHttpError(serverError);
logWithTimestamp(`Server Error: ${errorDescription}`);
