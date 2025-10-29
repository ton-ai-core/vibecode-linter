// ФАЙЛ С ПРОБЛЕМАМИ ФОРМАТИРОВАНИЯ
// Этот файл имеет плохое форматирование для демонстрации Biome

// Плохие отступы и пробелы
const badSpacing = {
	x: 1,
	y: 2,
	z: 3,
};

// Отсутствие пробелов в функциях
function badFunction(a: number, b: number): number {
	return a + b;
}

// Плохое форматирование массивов
const messyArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Смешанные кавычки
const singleQuotes = "одинарные кавычки";
const doubleQuotes = "двойные кавычки";

// Лишние точки с запятой
const extraSemicolon = "лишняя точка с запятой";

// Плохое форматирование объектов
const messyObject = {
	name: "John",
	age: 30,
	city: "New York",
	country: "USA",
};

// Плохое форматирование условий
if (true) {
	console.log("плохое форматирование if");
} else {
	console.log("плохое форматирование else");
}

// Длинная строка без переносов
const longString =
	"Это очень длинная строка которая должна быть перенесена на несколько строк для лучшей читаемости кода и соответствия стандартам форматирования";

// useConst: 'shouldBeConst' is never reassigned. Use 'const' instead of 'let'
const shouldBeConst = "это должно быть const";

// useTemplate: Template literal is preferred over string concatenation
const concatenation = "Hello " + "World" + "!";

export { badSpacing, badFunction, messyArray, longString };
