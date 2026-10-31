import { describe, expect, it } from 'vitest'
import {
  externalGridSvg,
  generatorSvg,
  notEnergisedSvg,
  quantisedAngle,
  symbolScale,
  shuntKind,
  shuntSvg,
  svgDataUri,
  symbolUri,
  transformer3Svg,
  transformerSvg,
} from './symbols'

const P = { stroke: '#111110', surface: '#ffffff', muted: '#898781' }
const HV = '#2a78d6'
const LV = '#eb6834'

describe('symbols', () => {
  it('draws the transformer with both voltage-level colours', () => {
    const s = transformerSvg(HV, LV, P)
    expect(s).toContain(HV)
    expect(s).toContain(LV)
    expect(s.match(/<circle/g)?.length).toBe(4) // 2 fills + 2 strokes
    expect(transformerSvg(HV, LV, P, { angle: 30 })).toContain('rotate(30 18 18)')
  })

  it('draws the 3-winding transformer with three colours', () => {
    const s = transformer3Svg([HV, LV, '#1baf7a'], P)
    for (const c of [HV, LV, '#1baf7a']) expect(s).toContain(c)
  })

  it('chooses a capacitor for b1 > 0 and a reactor for b1 < 0', () => {
    expect(shuntKind(0.018)).toBe('capacitor')
    expect(shuntKind(-0.0027)).toBe('reactor')
    expect(shuntKind(0)).toBe('generic')
    expect(shuntKind(null)).toBe('generic')
    expect(shuntKind(undefined)).toBe('generic')
    // the three drawings differ
    const kinds = new Set((['capacitor', 'reactor', 'generic'] as const).map((k) => shuntSvg(k, P)))
    expect(kinds.size).toBe(3)
    expect(shuntSvg('reactor', P)).toContain('A3.4')
  })

  it('uses the muted colour for the out-of-service variant', () => {
    const t = transformerSvg(HV, LV, P, { off: true })
    expect(t).toContain(P.muted)
    expect(t).not.toContain(HV)
    expect(t).not.toContain(LV)
    for (const s of [generatorSvg(P, { off: true }), externalGridSvg(P, { off: true }), shuntSvg('capacitor', P, { off: true })]) {
      expect(s).toContain(P.muted)
      expect(s).not.toContain(P.stroke)
    }
    expect(transformer3Svg([HV, LV, HV], P, { off: true })).not.toContain(HV)
  })

  it('draws the not-energised cross in the muted colour only', () => {
    const s = notEnergisedSvg(P)
    expect(s).toContain(`stroke="${P.muted}"`)
    expect(s).not.toContain(P.stroke)
    expect(s).not.toContain(P.surface)
    expect(s.match(/M[\d.]+ [\d.]+L/g)?.length).toBe(2) // two strokes: a ×
    expect(notEnergisedSvg({ muted: '#8f8d86' })).toContain('#8f8d86')
  })

  it('produces valid SVG data URIs', () => {
    const uris = [
      symbolUri.transformer(HV, LV, P),
      symbolUri.transformer3([HV, LV, HV], P),
      symbolUri.generator(P),
      symbolUri.externalGrid(P),
      symbolUri.shunt('reactor', P),
      symbolUri.notEnergised(P),
    ]
    for (const u of uris) {
      expect(u.startsWith('data:image/svg+xml')).toBe(true)
      const body = decodeURIComponent(u.slice(u.indexOf(',') + 1))
      expect(body.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      expect(body.endsWith('</svg>')).toBe(true)
      expect(u).not.toMatch(/[#<>"\s]/) // fully encoded
    }
    expect(svgDataUri('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')
  })

  it('scales symbols to stay legible across zoom levels', () => {
    expect(symbolScale(1)).toBe(1)
    expect(symbolScale(0.35)).toBe(2) // rendered at 0.7x base when zoomed far out
    expect(symbolScale(3.6)).toBe(0.5) // capped at 1.8x base when zoomed in
  })

  it('quantises edge angles', () => {
    expect(quantisedAngle(1, 0)).toBe(0)
    expect(quantisedAngle(0, 1)).toBe(90)
    expect(quantisedAngle(-1, -0.0001)).toBe(180)
    expect(quantisedAngle(1, 1.05)).toBe(45)
    expect(quantisedAngle(0, 0)).toBe(0)
  })
})
