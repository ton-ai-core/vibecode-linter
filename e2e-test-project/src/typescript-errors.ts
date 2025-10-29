// ФАЙЛ С ОШИБКАМИ TYPESCRIPT
// Этот файл содержит намеренные ошибки TypeScript для демонстрации

// TS2322: Type 'string' is not assignable to type 'number'
const numberVar: number = "это строка, а не число";

// TS2322: Type 'undefined' is not assignable to type 'string'
const requiredString: string = undefined;

// TS2339: Property 'nonExistent' does not exist on type '{}'
const emptyObj = {};
console.log(emptyObj.nonExistent);

// TS2345: Argument of type 'string' is not assignable to parameter of type 'number'
function addNumbers(a: number, b: number): number {
	return a + b;
}
const result = addNumbers("5", "10");

// TS2322: Object literal may only specify known properties
interface User {
	name: string;
	age: number;
}

const user: User = {
	name: "John",
	age: 30,
	email: "john@example.com", // Лишнее свойство
};

// TS2531: Object is possibly 'null' (strictNullChecks)
function processArray(arr: number[] | null) {
	return arr.length; // arr может быть null
}

// TS7006: Parameter implicitly has an 'any' type
function implicitAny(param) {
	return param.toString();
}

// TS2322: Type 'any' is not assignable to type 'string'
const explicitAny: any = 42;
const stringFromAny: string = explicitAny;

export { numberVar, user, processArray };
