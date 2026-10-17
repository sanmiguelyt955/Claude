export class GeminiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}
