import type { CreateJobRequest } from "../../services/controller/src/contracts.js";
import analysisSchema from "./analysis-result.schema.json" with { type: "json" };
import priceSchema from "./price-result.schema.json" with { type: "json" };
import { canonicalDisclaimer } from "./disclaimer.js";

interface FieldSpec {
  type?: string;
  const?: unknown;
  enum?: readonly unknown[];
  pattern?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  exclusiveMinimum?: number;
  items?: FieldSpec;
}

interface ResultSpec {
  type: string;
  additionalProperties: boolean;
  required: readonly string[];
  properties: Record<string, FieldSpec>;
}

const allowedFieldKeys = new Set(["type", "const", "enum", "pattern", "format", "minLength", "maxLength", "minItems", "maxItems", "exclusiveMinimum", "items"]);
const allowedObjectKeys = new Set(["$schema", "$id", "title", "type", "additionalProperties", "required", "properties"]);

function canonicalUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function fieldValid(value: unknown, spec: FieldSpec): boolean {
  if (Object.keys(spec).some((key) => !allowedFieldKeys.has(key))) return false;
  if (spec.const !== undefined && value !== spec.const) return false;
  if (spec.enum && !spec.enum.includes(value)) return false;
  if (spec.type === "string") {
    if (typeof value !== "string" || value.length < (spec.minLength ?? 0) || value.length > (spec.maxLength ?? Infinity)) return false;
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) return false;
    if (spec.format === "date-time" && !canonicalUtc(value)) return false;
    return spec.format === undefined || spec.format === "date-time";
  }
  if (spec.type === "number") {
    return typeof value === "number" && Number.isFinite(value) &&
      (spec.exclusiveMinimum === undefined || value > spec.exclusiveMinimum);
  }
  if (spec.type === "array") {
    return Array.isArray(value) && value.length >= (spec.minItems ?? 0) && value.length <= (spec.maxItems ?? Infinity) &&
      spec.items !== undefined && value.every((item) => fieldValid(item, spec.items!));
  }
  // These result schemas deliberately use only string, number and array
  // fields. An unsupported schema feature must fail closed at this boundary.
  return spec.type === undefined && (spec.const !== undefined || spec.enum !== undefined);
}

function shapeValid(value: unknown, spec: ResultSpec): value is Record<string, unknown> {
  if (Object.keys(spec).some((key) => !allowedObjectKeys.has(key)) ||
      spec.type !== "object" || spec.additionalProperties !== false ||
      value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return spec.required.every((key) => Object.hasOwn(record, key)) &&
    keys.every((key) => Object.hasOwn(spec.properties, key) && fieldValid(record[key], spec.properties[key]!));
}

/** Validates the persisted result against the versioned public contract before any API read. */
export function storedResultValid(value: unknown, expected: CreateJobRequest): boolean {
  const spec = (expected.operation === "PRICE" ? priceSchema : analysisSchema) as ResultSpec;
  const resultKind = expected.operation === "PRICE" ? "PRICE" : "ANALYSIS";
  return shapeValid(value, spec) && value.kind === resultKind && value.symbol === expected.symbol &&
    (expected.operation !== "ANALYZE" ||
      (value.locale === expected.locale && value.disclaimer === canonicalDisclaimer(expected.locale)));
}
