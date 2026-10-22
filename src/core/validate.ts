// A small schema checker for content files. Every problem names the file and the field, as the
// first-build checklist asks: "a deliberately broken file is rejected with a clear message naming
// the file and field".

export type Schema =
  | { type: 'string'; nonEmpty?: boolean; pattern?: RegExp; oneOf?: readonly string[] }
  | { type: 'number'; integer?: boolean; min?: number; max?: number }
  | { type: 'boolean' }
  | { type: 'array'; items: Schema; minItems?: number; maxItems?: number }
  | { type: 'object'; fields: Record<string, Schema>; optional?: readonly string[]; extra?: boolean }
  | { type: 'record'; values: Schema };

export interface ContentError {
  file: string;
  field: string;
  message: string;
}

export function formatError(e: ContentError): string {
  return `${e.file}: ${e.field || '(file)'}: ${e.message}`;
}

export function validate(file: string, value: unknown, schema: Schema, field = ''): ContentError[] {
  const errors: ContentError[] = [];
  const fail = (message: string, at = field) => errors.push({ file, field: at, message });
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return fail(`expected text, got ${describe(value)}`), errors;
      if (schema.nonEmpty && value.trim() === '') fail('must not be empty');
      if (schema.pattern && !schema.pattern.test(value)) fail(`"${value}" does not match ${schema.pattern}`);
      if (schema.oneOf && !schema.oneOf.includes(value)) fail(`"${value}" must be one of ${schema.oneOf.join(', ')}`);
      return errors;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) return fail(`expected a number, got ${describe(value)}`), errors;
      if (schema.integer && !Number.isInteger(value)) fail(`${value} must be a whole number`);
      if (schema.min !== undefined && value < schema.min) fail(`${value} is below the minimum ${schema.min}`);
      if (schema.max !== undefined && value > schema.max) fail(`${value} is above the maximum ${schema.max}`);
      return errors;
    case 'boolean':
      if (typeof value !== 'boolean') fail(`expected true or false, got ${describe(value)}`);
      return errors;
    case 'array':
      if (!Array.isArray(value)) return fail(`expected a list, got ${describe(value)}`), errors;
      if (schema.minItems !== undefined && value.length < schema.minItems) fail(`needs at least ${schema.minItems} items`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`allows at most ${schema.maxItems} items`);
      value.forEach((v, i) => errors.push(...validate(file, v, schema.items, `${field}[${i}]`)));
      return errors;
    case 'record':
      if (!isPlainObject(value)) return fail(`expected an object, got ${describe(value)}`), errors;
      for (const [k, v] of Object.entries(value)) errors.push(...validate(file, v, schema.values, join(field, k)));
      return errors;
    case 'object': {
      if (!isPlainObject(value)) return fail(`expected an object, got ${describe(value)}`), errors;
      for (const [k, s] of Object.entries(schema.fields)) {
        if (!(k in value)) {
          if (!schema.optional?.includes(k)) fail('is missing', join(field, k));
          continue;
        }
        errors.push(...validate(file, value[k], s, join(field, k)));
      }
      if (!schema.extra) for (const k of Object.keys(value)) if (!(k in schema.fields)) fail('is not a known field', join(field, k));
      return errors;
    }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function join(field: string, k: string): string {
  return field ? `${field}.${k}` : k;
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  return typeof v === 'string' ? `text "${v}"` : typeof v;
}
