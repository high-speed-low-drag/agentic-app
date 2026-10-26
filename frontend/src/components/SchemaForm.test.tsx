import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { JsonSchema } from '../api/schema'
import { SchemaForm } from './SchemaForm'

const schema: JsonSchema = {
  type: 'object',
  properties: {
    seed: { type: 'integer', default: 1, title: 'Random seed' },
    peak: { type: 'number', minimum: 0, maximum: 2, title: 'Peak', description: 'Peak multiplier' },
    shape: { type: 'string', enum: ['flat', 'peaky'], default: 'flat', title: 'Shape' },
    weekend: { type: 'boolean', default: true, title: 'Weekend effect' },
    label: { type: 'string', title: 'Label' },
  },
}

function Harness({ onChange }: { onChange: (v: Record<string, unknown>) => void }) {
  const [v, setV] = useState<Record<string, unknown>>({ seed: 1, shape: 'flat', weekend: true })
  return (
    <SchemaForm
      schema={schema}
      value={v}
      onChange={(n) => {
        setV(n)
        onChange(n)
      }}
    />
  )
}

describe('SchemaForm', () => {
  it('renders one control per property with titles', () => {
    render(<Harness onChange={() => {}} />)
    expect(screen.getByLabelText('Random seed')).toHaveValue('1')
    expect(screen.getByLabelText('Peak')).toHaveValue('')
    expect(screen.getByLabelText('Shape')).toHaveValue('flat')
    expect(screen.getByLabelText('Weekend effect')).toBeChecked()
    expect(screen.getByLabelText('Label')).toBeInTheDocument()
    expect(screen.getByText(/Peak multiplier/)).toBeInTheDocument()
  })

  it('emits typed values', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Peak'), { target: { value: '1.5' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ peak: 1.5 }))
    fireEvent.change(screen.getByLabelText('Shape'), { target: { value: 'peaky' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ shape: 'peaky' }))
    fireEvent.click(screen.getByLabelText('Weekend effect'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ weekend: false }))
  })

  it('shows range errors', () => {
    render(<Harness onChange={() => {}} />)
    fireEvent.change(screen.getByLabelText('Peak'), { target: { value: '5' } })
    expect(screen.getByText('Must be ≤ 2')).toBeInTheDocument()
  })
})
