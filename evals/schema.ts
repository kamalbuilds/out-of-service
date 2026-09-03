/**
 * A small JSON Schema (draft 2020-12 subset) validator.
 *
 * ajv is not in this project's dependency tree and the eval fixtures must not need a new
 * install to be checkable, so this covers exactly the keywords the tool schemas use:
 * type, properties, required, additionalProperties: false, items, minItems, minimum,
 * maximum, minLength, maxLength, enum.
 */

export type Schema = Record<string, unknown>;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

export function validate(schema: Schema, value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  const type = schema.type as string | string[] | undefined;

  if (type) {
    const allowed = Array.isArray(type) ? type : [type];
    if (!allowed.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${allowed.join(" or ")}, got ${typeOf(value)}`);
      return errors;
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((v) => v === value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === "string") {
    const { minLength, maxLength } = schema as { minLength?: number; maxLength?: number };
    if (typeof minLength === "number" && value.length < minLength) {
      errors.push(`${path}: shorter than minLength ${minLength}`);
    }
    if (typeof maxLength === "number" && value.length > maxLength) {
      errors.push(`${path}: longer than maxLength ${maxLength}`);
    }
  }

  if (typeof value === "number") {
    const { minimum, maximum } = schema as { minimum?: number; maximum?: number };
    if (typeof minimum === "number" && value < minimum) errors.push(`${path}: below minimum ${minimum}`);
    if (typeof maximum === "number" && value > maximum) errors.push(`${path}: above maximum ${maximum}`);
  }

  if (Array.isArray(value)) {
    const { minItems, items } = schema as { minItems?: number; items?: Schema };
    if (typeof minItems === "number" && value.length < minItems) {
      errors.push(`${path}: needs at least ${minItems} items, got ${value.length}`);
    }
    if (items) value.forEach((item, i) => errors.push(...validate(items, item, `${path}[${i}]`)));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    const required = (schema.required ?? []) as string[];

    for (const key of required) {
      if (!(key in object)) errors.push(`${path}: missing required property "${key}"`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!(key in properties)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in object) errors.push(...validate(propertySchema, object[key], `${path}.${key}`));
    }
  }

  return errors;
}
