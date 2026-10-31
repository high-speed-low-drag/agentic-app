/**
 * IEC single-line style equipment symbols for the network diagram, as SVG data URIs.
 *
 * Pure functions: callers pass the colours (from the chart theme), so the images can be
 * regenerated when the theme changes. Symbols are strokes on a transparent background,
 * drawn on a 24-unit grid (transformers on 36) and meant to be shown at roughly 16–28 px.
 */

/** Theme colours a symbol needs. */
export interface SymbolPalette {
  /** default stroke (generator, external grid, shunt) */
  stroke: string
  /** light fill behind strokes, so a line beneath does not show through */
  surface: string
  /** stroke of the out-of-service variant */
  muted: string
}

export interface SymbolOptions {
  /** Out of service: hollow, muted-grey variant. */
  off?: boolean
}

export type ShuntKind = 'capacitor' | 'reactor' | 'generic'

/** Capacitor for positive susceptance, reactor for negative, generic when unknown or zero. */
export function shuntKind(b1: number | null | undefined): ShuntKind {
  if (b1 === null || b1 === undefined || !Number.isFinite(b1) || b1 === 0) return 'generic'
  return b1 > 0 ? 'capacitor' : 'reactor'
}

/** Encode an SVG document as a data URI usable as a Cytoscape background image or `<img src>`. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const SW = 1.8 // stroke width on the 24-unit grid

function svg(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`
}

const r1 = (n: number) => +n.toFixed(2)

/**
 * 2-winding transformer: two overlapping circles side by side, each stroked in its side's
 * voltage-level colour (`from` on the left). `angle` (degrees, clockwise) rotates the symbol
 * about its centre, so it can follow the edge direction.
 */
export function transformerSvg(from: string, to: string, p: SymbolPalette, opts: SymbolOptions & { angle?: number } = {}): string {
  const [a, b] = opts.off ? [p.muted, p.muted] : [from, to]
  const r = 8.5
  const fill = `<circle cx="13" cy="18" r="${r}" fill="${p.surface}"/><circle cx="23" cy="18" r="${r}" fill="${p.surface}"/>`
  const dash = opts.off ? ' stroke-dasharray="3 2"' : ''
  const strokes =
    `<circle cx="13" cy="18" r="${r}" fill="none" stroke="${a}" stroke-width="${SW}"${dash}/>` +
    `<circle cx="23" cy="18" r="${r}" fill="none" stroke="${b}" stroke-width="${SW}"${dash}/>`
  const rot = r1(opts.angle ?? 0)
  return svg(36, rot ? `<g transform="rotate(${rot} 18 18)">${fill}${strokes}</g>` : fill + strokes)
}

/** 3-winding transformer: three overlapping circles in a triangle, coloured by node_1/2/3. */
export function transformer3Svg(colors: [string, string, string], p: SymbolPalette, opts: SymbolOptions = {}): string {
  const cs = opts.off ? [p.muted, p.muted, p.muted] : colors
  const r = 8
  const centres: [number, number][] = [
    [18, 12],
    [12.2, 22],
    [23.8, 22],
  ]
  const dash = opts.off ? ' stroke-dasharray="3 2"' : ''
  const fill = centres.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.surface}"/>`).join('')
  const strokes = centres
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${cs[i]}" stroke-width="${SW}"${dash}/>`)
    .join('')
  return svg(36, fill + strokes)
}

/** Generator: a circle with a sine stroke inside. */
export function generatorSvg(p: SymbolPalette, opts: SymbolOptions = {}): string {
  const c = opts.off ? p.muted : p.stroke
  const fill = opts.off ? 'none' : p.surface
  return svg(
    24,
    `<circle cx="12" cy="12" r="10" fill="${fill}" stroke="${c}" stroke-width="${SW}"/>` +
      `<path d="M6 12 C7.5 7.5 10.5 7.5 12 12 S16.5 16.5 18 12" fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>`,
  )
}

/** External grid (source): a square with diagonal hatching. */
export function externalGridSvg(p: SymbolPalette, opts: SymbolOptions = {}): string {
  const c = opts.off ? p.muted : p.stroke
  const fill = opts.off ? 'none' : p.surface
  const lo = 2.5
  const hi = 21.5
  // hatch lines x + y = k, clipped to the square
  const lines: string[] = []
  for (let k = lo * 2 + 5; k < hi * 2; k += 5) {
    const x1 = Math.max(lo, k - hi)
    const x2 = Math.min(hi, k - lo)
    lines.push(`M${r1(x1)} ${r1(k - x1)}L${r1(x2)} ${r1(k - x2)}`)
  }
  return svg(
    24,
    `<rect x="${lo}" y="${lo}" width="${hi - lo}" height="${hi - lo}" fill="${fill}"/>` +
      `<path d="${lines.join('')}" stroke="${c}" stroke-width="1.1"/>` +
      `<rect x="${lo}" y="${lo}" width="${hi - lo}" height="${hi - lo}" fill="none" stroke="${c}" stroke-width="${SW}"/>`,
  )
}

/** Shunt: capacitor (two parallel plates), reactor (inductor coil) or a generic impedance box. */
export function shuntSvg(kind: ShuntKind, p: SymbolPalette, opts: SymbolOptions = {}): string {
  const c = opts.off ? p.muted : p.stroke
  const st = `fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"`
  let body: string
  if (kind === 'capacitor') {
    body = `<path d="M12 2V9.5M12 14.5V22" ${st}/><path d="M5 9.5H19M5 14.5H19" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`
  } else if (kind === 'reactor') {
    // vertical coil: four half-turns bulging right
    body = `<path d="M12 2V4.5A3.4 3.4 0 0 1 12 9.5A3.4 3.4 0 0 1 12 14.5A3.4 3.4 0 0 1 12 19.5V22" ${st}/>`
  } else {
    body = `<path d="M12 2V6M12 18V22" ${st}/><rect x="8" y="6" width="8" height="12" ${st}/>`
  }
  // a faint plate behind so the stub beneath does not cut through the symbol
  const bg = opts.off ? '' : `<rect x="4" y="2" width="16" height="20" rx="3" fill="${p.surface}" fill-opacity="0.85"/>`
  return svg(24, bg + body)
}

/**
 * "Not energised" mark for a bus node: a small × through the centre, in the muted colour, on a
 * transparent background (the node itself draws the dashed muted ring).
 */
export function notEnergisedSvg(p: Pick<SymbolPalette, 'muted'>): string {
  return svg(24, `<path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" fill="none" stroke="${p.muted}" stroke-width="3" stroke-linecap="round"/>`)
}

/** Data-URI convenience wrappers. */
export const symbolUri = {
  transformer: (from: string, to: string, p: SymbolPalette, opts?: SymbolOptions & { angle?: number }) =>
    svgDataUri(transformerSvg(from, to, p, opts)),
  transformer3: (colors: [string, string, string], p: SymbolPalette, opts?: SymbolOptions) =>
    svgDataUri(transformer3Svg(colors, p, opts)),
  generator: (p: SymbolPalette, opts?: SymbolOptions) => svgDataUri(generatorSvg(p, opts)),
  externalGrid: (p: SymbolPalette, opts?: SymbolOptions) => svgDataUri(externalGridSvg(p, opts)),
  shunt: (kind: ShuntKind, p: SymbolPalette, opts?: SymbolOptions) => svgDataUri(shuntSvg(kind, p, opts)),
  notEnergised: (p: Pick<SymbolPalette, 'muted'>) => svgDataUri(notEnergisedSvg(p)),
}

/** Symbols keep a rendered size between these multiples of their base size, whatever the zoom. */
export const SYMBOL_ZOOM_MIN = 0.7
export const SYMBOL_ZOOM_MAX = 1.8

/**
 * Extra model-space scale for symbols at a zoom level: it keeps them legible when zoomed far out and
 * stops them growing huge when zoomed in (rendered size = base * zoom * scale). Quantised to 5 %.
 */
export function symbolScale(zoom: number): number {
  const f = zoom < SYMBOL_ZOOM_MIN ? SYMBOL_ZOOM_MIN / zoom : zoom > SYMBOL_ZOOM_MAX ? SYMBOL_ZOOM_MAX / zoom : 1
  return Math.round(f * 20) / 20
}

/** Edge angle in degrees, quantised to `step` so images are regenerated only on visible changes. */
export function quantisedAngle(dx: number, dy: number, step = 5): number {
  if (dx === 0 && dy === 0) return 0
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const q = Math.round(deg / step) * step
  return q === -180 ? 180 : q
}
