/**
 * ФАЙЛ С ПРОБЛЕМАМИ ФОРМАТИРОВАНИЯ
 *
 * Этот файл демонстрирует различные проблемы форматирования,
 * которые должны быть исправлены Biome
 */

// ❌ Плохие отступы и пробелы
const badSpacing = {
	x: 1,
	y: 2,
	z: 3,
	a: 4,
	b: 5,
};

// ❌ Отсутствие пробелов в функциях
function badFunction(a: number, b: number, c: string): string {
	return a + b + c;
}

// ❌ Плохое форматирование массивов
const messyArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const nestedArray = [
	[1, 2],
	[3, 4],
	[5, 6],
];

// ❌ Смешанные кавычки (должны быть двойные по конфигурации)
const singleQuotes = "одинарные кавычки";
const mixedQuotes = "начало одинарными" + "конец двойными";
const templateInSingle = `template literal`;

// ❌ Лишние точки с запятой
const extraSemicolon = "лишняя точка с запятой";
const anotherExtra = 42;

// ❌ Плохое форматирование объектов
const messyObject = {
	name: "John",
	age: 30,
	city: "New York",
	country: "USA",
	address: { street: "123 Main St", zip: 12345 },
};

// ❌ Плохое форматирование условий
if (true) {
	console.log("плохое форматирование if");
} else if (false) {
	console.log("плохое форматирование else if");
} else {
	console.log("плохое форматирование else");
}

// ❌ Плохое форматирование циклов
for (let i = 0; i < 10; i++) {
	console.log(i);
}

while (true) {
	break;
}

// ❌ Длинная строка без переносов
const longString =
	"Это очень длинная строка которая должна быть перенесена на несколько строк для лучшей читаемости кода и соответствия стандартам форматирования, установленным в конфигурации Biome";

// ❌ useConst: 'shouldBeConst' is never reassigned
const shouldBeConst = "это должно быть const";
const anotherShouldBeConst = [1, 2, 3];
const objectShouldBeConst = { key: "value" };

// ❌ useTemplate: Template literal is preferred over string concatenation
const concatenation = "Hello " + "World" + "!";
const complexConcatenation =
	"User: " + userName + ", Age: " + userAge + " years old";
const numberConcatenation = "Result: " + (5 + 3) + " items";

// ❌ useShorthandPropertyAssignment
const userName = "Alice";
const userAge = 25;
const userObject = {
	userName,
	userAge,
	isActive,
};

// ❌ useExponentiationOperator
const powerCalculation = 2 ** 8;
const anotherPower = base ** exponent;

// ❌ Плохое форматирование функций
const arrowFunction = (x, y) => x + y;
const asyncFunction = async (data) => {
	const result = await processData(data);
	return result;
};

// ❌ Плохое форматирование типов
interface BadInterface {
	name: string;
	age: number;
	email: string;
}

interface BadType {
	id: number;
	data: string[];
}

// ❌ Плохое форматирование импортов/экспортов
export { badSpacing, badFunction, messyArray, longString, userObject };

// ❌ Плохое форматирование комментариев
/*плохой блочный комментарий без пробелов*/
//плохой строчный комментарий

// Вспомогательные переменные
const isActive = true;
const base = 2;
const exponent = 3;

async function processData(data: unknown): Promise<unknown> {
	return data;
}
