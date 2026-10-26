/**
 * Minimal JSON-Schema interpretation for generating forms from Pydantic models
 * (profile generator `params_schema`). Supports number/integer/string/boolean/enum,
 * `$ref` into `$defs`, `allOf: [{$ref}]`, and `anyOf: [X, {type: null}]` (Optional[X]).
 */
import type { JsonSchema } from '../api/schema'

export type FieldKind = 'number' | 'integer' | 'string' | 'boolean' | 'enum' | 'unsupported'

export interface FieldSpec {
  name: string
  kind: FieldKind
  title: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  options?: { value: string; label: string; raw: unknown }[]
  nullable: boolean
  required: boolean
  format?: string
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema | undefined {
  const m = /^#\/(\$defs|definitions)\/(.+)$/.exec(ref)
  if (!m) return undefined
  const defs = m[1] === '$defs' ? root.$defs : root.definitions
  return defs?.[decodeURIComponent(m[2])]
}

/** Resolve $ref / allOf wrappers, merging annotation keywords from the wrapper. */
export function deref(s: JsonSchema, root: JsonSchema, depth = 0): JsonSchema {
  if (depth > 10) return s
  if (s.$ref) {
    const target = resolveRef(s.$ref, root)
    if (target) {
      const { $ref: _ignored, ...rest } = s
      return deref({ ...target, ...rest }, root, depth + 1)
    }
  }
  if (s.allOf && s.allOf.length === 1) {
    const { allOf, ...rest } = s
    return deref({ ...deref(allOf[0], root, depth + 1), ...rest }, root, depth + 1)
  }
  return s
}

export function humanizeKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function fieldSpec(name: string, raw: JsonSchema, root: JsonSchema, required: boolean): FieldSpec {
  let s = deref(raw, root)
  let nullable = false
  const variants = s.anyOf ?? s.oneOf
  if (variants) {
    const nonNull = variants.map((v) => deref(v, root)).filter((v) => v.type !== 'null')
    nullable = nonNull.length < variants.length
    if (nonNull.length === 1) {
      const { anyOf: _a, oneOf: _o, ...rest } = s
      s = { ...nonNull[0], ...rest }
    }
  }
  let type = s.type
  if (Array.isArray(type)) {
    const t = type as string[]
    nullable = nullable || t.includes('null')
    type = t.find((x) => x !== 'null')
  }

  const base = {
    name,
    title: s.title ?? humanizeKey(name),
    description: s.description,
    default: s.default,
    minimum: s.minimum,
    maximum: s.maximum,
    exclusiveMinimum: s.exclusiveMinimum,
    exclusiveMaximum: s.exclusiveMaximum,
    nullable,
    required,
    format: s.format,
  }

  if (s.enum && s.enum.length) {
    return {
      ...base,
      kind: 'enum',
      options: s.enum.map((v) => ({ value: String(v), label: typeof v === 'string' ? humanizeKey(v) : String(v), raw: v })),
    }
  }
  if (s.const !== undefined) {
    return { ...base, kind: 'enum', options: [{ value: String(s.const), label: String(s.const), raw: s.const }] }
  }
  switch (type) {
    case 'number':
      return { ...base, kind: 'number' }
    case 'integer':
      return { ...base, kind: 'integer' }
    case 'string':
      return { ...base, kind: 'string' }
    case 'boolean':
      return { ...base, kind: 'boolean' }
    default:
      return { ...base, kind: 'unsupported' }
  }
}

/** Field specs for each property of an object schema, in declaration order. */
export function fieldsFromSchema(schema: JsonSchema | undefined | null): FieldSpec[] {
  if (!schema) return []
  const root = schema
  const obj = deref(schema, root)
  const req = new Set(obj.required ?? [])
  return Object.entries(obj.properties ?? {}).map(([k, v]) => fieldSpec(k, v, root, req.has(k)))
}

/** Default parameter values from a schema (only fields that declare a default). */
export function defaultsFromSchema(schema: JsonSchema | undefined | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fieldsFromSchema(schema)) {
    if (f.default !== undefined) out[f.name] = f.default
    else if (f.kind === 'boolean' && f.required) out[f.name] = false
  }
  return out
}

/** Client-side check of a value against a field spec. Returns an error message or null. */
export function validateField(f: FieldSpec, v: unknown): string | null {
  if (v === undefined || v === null || v === '') {
    if (f.required && !f.nullable && f.default === undefined) return 'Required'
    return null
  }
  if (f.kind === 'number' || f.kind === 'integer') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'Must be a number'
    if (f.kind === 'integer' && !Number.isInteger(v)) return 'Must be an integer'
    if (f.minimum !== undefined && v < f.minimum) return `Must be ≥ ${f.minimum}`
    if (f.maximum !== undefined && v > f.maximum) return `Must be ≤ ${f.maximum}`
    if (f.exclusiveMinimum !== undefined && v <= f.exclusiveMinimum) return `Must be > ${f.exclusiveMinimum}`
    if (f.exclusiveMaximum !== undefined && v >= f.exclusiveMaximum) return `Must be < ${f.exclusiveMaximum}`
  }
  return null
}
