export class AppError extends Error {
  constructor(message, { code = "APP_ERROR", status = 400, details } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorPayload(error) {
  return {
    error: {
      code: error?.code || "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
      ...(error?.details ? { details: error.details } : {}),
    },
  };
}
