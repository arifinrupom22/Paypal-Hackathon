export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("CONFIGURATION_REQUIRED", message, 503, details);
    this.name = "ConfigurationError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function safeErrorMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error && process.env.NODE_ENV !== "production") return error.message;
  return "An unexpected error occurred.";
}
