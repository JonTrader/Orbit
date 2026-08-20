/**
 * Base class for domain errors raised by `lib/services` and `lib/authz`.
 *
 * The stable `code` lets the HTTP layer map domain errors to statuses
 * without a hand-maintained registry of error class names.
 */
export class DomainError<TCode extends string = string> extends Error {
  constructor(
    readonly code: TCode,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
