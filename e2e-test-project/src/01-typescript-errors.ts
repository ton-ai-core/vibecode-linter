/**
 * ФАЙЛ С ОШИБКАМИ TYPESCRIPT
 *
 * Этот файл демонстрирует различные типы ошибок TypeScript,
 * которые должны быть обнаружены vibecode-linter
 */

// ❌ TS2322: Type 'string' is not assignable to type 'number'
export const numberFromString: number = "42";

// ❌ TS2322: Type 'undefined' is not assignable to type 'string'
export const requiredString: string = undefined;

// ❌ TS2322: Type 'null' is not assignable to type 'string'
export const nonNullableString: string = null;

// ❌ TS2339: Property 'nonExistent' does not exist on type '{}'
const emptyObject = {};
console.log(emptyObject.nonExistent);

// ❌ TS2345: Argument of type 'string' is not assignable to parameter of type 'number'
function multiply(a: number, b: number): number {
	return a * b;
}
const result = multiply("5", "10");

// ❌ TS2322: Object literal may only specify known properties
interface UserProfile {
	readonly name: string;
	readonly age: number;
	readonly email: string;
}

const userProfile: UserProfile = {
	name: "John Doe",
	age: 30,
	email: "john@example.com",
	// ❌ Лишнее свойство
	phone: "+1234567890",
	address: "123 Main St",
};

// ❌ TS2531: Object is possibly 'null' (strictNullChecks)
function processNullableArray(arr: number[] | null): number {
	// arr может быть null, но мы не проверяем
	return arr.length;
}

// ❌ TS7006: Parameter implicitly has an 'any' type
function implicitAnyParameter(data) {
	return data.toString();
}

// ❌ TS2322: Type 'any' is not assignable to type 'string'
const anyValue: any = { complex: "object" };
const stringValue: string = anyValue;

// ❌ TS2322: Type 'unknown' is not assignable to type 'string'
function processUnknown(data: unknown): string {
	return data; // Нужно type guard
}

// ❌ TS2367: This condition will always return 'false'
const alwaysFalse = "string" === 42;

// ❌ TS2532: Object is possibly 'undefined'
interface OptionalData {
	value?: string;
}

function useOptionalData(data: OptionalData): number {
	// data.value может быть undefined
	return data.value.length;
}

// ❌ TS2322: Index signature is missing in type
interface StrictObject {
	name: string;
	age: number;
}

const dynamicObject: StrictObject = {
	name: "Alice",
	age: 25,
};

// Попытка добавить свойство динамически
dynamicObject["email"] = "alice@example.com";

// ❌ TS2322: Type assertion errors
const assertionError = "string" as number;
const unsafeAssertion = null as any as string;

export {
	result,
	userProfile,
	processNullableArray,
	implicitAnyParameter,
	stringValue,
	processUnknown,
	alwaysFalse,
	useOptionalData,
	dynamicObject,
	assertionError,
	unsafeAssertion,
};
