import {
  OPERATIONS,
  PublicError,
  SUPPORTED_LOCALES,
  SUPPORTED_SYMBOLS,
  type CreateJobRequest,
  type Locale,
  type Operation,
  type SymbolCode,
} from "./contracts.js";

const allowedKeys = new Set(["operation", "symbol", "locale"]);

export function validateCreateJobRequest(input: unknown): CreateJobRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new PublicError("VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }

  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new PublicError("VALIDATION_ERROR", "Request contains unsupported fields.", 400);
  }

  if (!OPERATIONS.includes(record.operation as Operation)) {
    throw new PublicError("VALIDATION_ERROR", "Operation must be PRICE or ANALYZE.", 400);
  }
  if (!SUPPORTED_SYMBOLS.includes(record.symbol as SymbolCode)) {
    throw new PublicError("UNSUPPORTED_SYMBOL", "The requested symbol is not supported.", 400);
  }
  if (!SUPPORTED_LOCALES.includes(record.locale as Locale)) {
    throw new PublicError("UNSUPPORTED_LOCALE", "The requested locale is not supported.", 400);
  }

  return {
    operation: record.operation as Operation,
    symbol: record.symbol as SymbolCode,
    locale: record.locale as Locale,
  };
}

export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new PublicError("VALIDATION_ERROR", "Idempotency-Key must be a UUID.", 400);
  }
  return value;
}
