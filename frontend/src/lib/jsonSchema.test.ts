import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '../api/schema'
import { defaultsFromSchema, fieldsFromSchema, validateField } from './jsonSchema'

// Shape produced by Pydantic v2 model_json_schema()
const schema: JsonSchema = {
  type: 'object',
  title: 'PvParams',
  $defs: { Orientation: { type: 'string', enum: ['south', 'east_west'], title: 'Orientation' } },
  properties: {
    seed: { type: 'integer', default: 1, title: 'Random seed' },
    peak: { type: 'number', minimum: 0, maximum: 2, default: 1, description: 'Peak multiplier' },
    orientation: { $ref: '#/$defs/Orientation', default: 'south' },
    cloudy: { type: 'boolean', default: false },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
  },
  required: [],
}

describe('fieldsFromSchema', () => {
  it('maps property types, refs and Optional[] wrappers', () => {
    const f = fieldsFromSchema(schema)
    expect(f.map((x) => [x.name, x.kind])).toEqual([
      ['seed', 'integer'],
      ['peak', 'number'],
      ['orientation', 'enum'],
      ['cloudy', 'boolean'],
      ['note', 'string'],
    ])
    expect(f[0].title).toBe('Random seed')
    expect(f[1].maximum).toBe(2)
    expect(f[2].options?.map((o) => o.value)).toEqual(['south', 'east_west'])
    expect(f[4].nullable).toBe(true)
  })

  it('collects defaults', () => {
    expect(defaultsFromSchema(schema)).toEqual({ seed: 1, peak: 1, orientation: 'south', cloudy: false, note: null })
  })

  it('validates ranges and integers', () => {
    const [seed, peak] = fieldsFromSchema(schema)
    expect(validateField(peak, 3)).toMatch(/≤ 2/)
    expect(validateField(peak, 1.5)).toBeNull()
    expect(validateField(seed, 1.5)).toMatch(/integer/)
  })
})
