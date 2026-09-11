/** Thrown when the local quota guard defers a call rather than making it. */
export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly retryAfter: Date,
  ) {
    super(message)
    this.name = 'QuotaExceededError'
  }
}
