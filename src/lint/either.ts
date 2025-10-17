// CHANGE: Either monad module
// WHY: Separate error handling monad for reusability
// QUOTE(TЗ): "Давать проверяемые решения через формализацию"
// REF: REQ-LINT-EITHER-001
// SOURCE: Functional programming patterns

/**
 * Result type for computations that may fail.
 * 
 * @typeParam E - Error type
 * @typeParam A - Success value type
 * 
 * @invariant Either contains exactly one of Left (error) or Right (success)
 */
export type Either<E, A> = 
  | { readonly tag: "Left"; readonly error: E }
  | { readonly tag: "Right"; readonly value: A };

/**
 * Creates a Left (error) value.
 * 
 * @param error - Error value
 * @returns Either in error state
 * 
 * @complexity O(1) time, O(1) space
 */
export const left = <E, A>(error: E): Either<E, A> => 
  ({ tag: "Left", error });

/**
 * Creates a Right (success) value.
 * 
 * @param value - Success value
 * @returns Either in success state
 * 
 * @complexity O(1) time, O(1) space
 */
export const right = <E, A>(value: A): Either<E, A> => 
  ({ tag: "Right", value });

/**
 * Maps over Either's success value.
 * 
 * @param f - Transformation function
 * @param either - Either value
 * @returns Transformed Either
 * 
 * @complexity O(1) time, O(1) space
 */
export const eitherMap = <E, A, B>(
  f: (a: A) => B,
  either: Either<E, A>,
): Either<E, B> =>
  either.tag === "Right" ? right(f(either.value)) : either;

/**
 * Flat maps over Either's success value.
 * 
 * @param f - Function returning Either
 * @param either - Either value
 * @returns Flattened Either
 * 
 * @complexity O(1) time, O(1) space
 */
export const eitherFlatMap = <E, A, B>(
  f: (a: A) => Either<E, B>,
  either: Either<E, A>,
): Either<E, B> =>
  either.tag === "Right" ? f(either.value) : either;

/**
 * Extracts value from Either or returns default.
 * 
 * @param defaultValue - Value to return on error
 * @param either - Either value
 * @returns Extracted or default value
 * 
 * @complexity O(1) time, O(1) space
 */
export const eitherGetOrElse = <A>(
  defaultValue: A,
  either: Either<Error, A>,
): A =>
  either.tag === "Right" ? either.value : defaultValue;
