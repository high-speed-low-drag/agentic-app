import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Limits, ResultKpis } from '../api/schema'
import { fmtInt, fmtMwh, fmtNum, fmtPct, fmtPu, humanize } from '../lib/format'
import { cn } from '../lib/utils'

type Tone = 'neutral' | 'good' | 'bad'

function Tile({ label, value, sub, tone = 'neutral' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3 shadow-[0_1px_2px_var(--c-shadow)]">
      <div className="truncate text-xs font-medium text-fg-muted">{label}</div>
      <div className="text-xl font-semibold tracking-tight text-fg">{value}</div>
      {sub && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs',
            tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : 'text-fg-muted',
          )}
        >
          {tone === 'bad' && <AlertTriangle size={12} />}
          {tone === 'good' && <CheckCircle2 size={12} />}
          {sub}
        </div>
      )}
    </div>
  )
}

const KNOWN = new Set([
  'u_min_pu',
  'u_max_pu',
  'loading_max',
  'n_voltage_violations',
  'n_loading_violations',
  'energy_import_mwh',
  'energy_losses_mwh',
  'n_failed_timesteps',
])

export function KpiTiles({ kpis, limits, nTimesteps }: { kpis: ResultKpis; limits: Limits; nTimesteps: number }) {
  const uMinBad = kpis.u_min_pu !== null && kpis.u_min_pu < limits.u_min_pu
  const uMaxBad = kpis.u_max_pu !== null && kpis.u_max_pu > limits.u_max_pu
  const lBad = kpis.loading_max !== null && kpis.loading_max > limits.loading_max
  const lossPct =
    kpis.energy_import_mwh && kpis.energy_losses_mwh !== null ? (kpis.energy_losses_mwh / kpis.energy_import_mwh) * 100 : null
  const extra = Object.entries(kpis).filter(([k, v]) => !KNOWN.has(k) && typeof v === 'number')
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
      <Tile label="Min voltage" value={`${fmtPu(kpis.u_min_pu)} pu`} sub={`limit ${fmtPu(limits.u_min_pu, 2)}`} tone={uMinBad ? 'bad' : 'good'} />
      <Tile label="Max voltage" value={`${fmtPu(kpis.u_max_pu)} pu`} sub={`limit ${fmtPu(limits.u_max_pu, 2)}`} tone={uMaxBad ? 'bad' : 'good'} />
      <Tile label="Max loading" value={fmtPct(kpis.loading_max)} sub={`limit ${fmtPct(limits.loading_max, 0)}`} tone={lBad ? 'bad' : 'good'} />
      <Tile
        label="Voltage violations"
        value={fmtInt(kpis.n_voltage_violations)}
        sub={kpis.n_voltage_violations ? 'episodes' : 'none'}
        tone={kpis.n_voltage_violations ? 'bad' : 'good'}
      />
      <Tile
        label="Loading violations"
        value={fmtInt(kpis.n_loading_violations)}
        sub={kpis.n_loading_violations ? 'episodes' : 'none'}
        tone={kpis.n_loading_violations ? 'bad' : 'good'}
      />
      <Tile label="Energy import" value={fmtMwh(kpis.energy_import_mwh)} />
      <Tile label="Energy losses" value={fmtMwh(kpis.energy_losses_mwh)} sub={lossPct !== null ? `${lossPct.toFixed(2)} % of import` : undefined} />
      <Tile
        label="Failed timesteps"
        value={fmtInt(kpis.n_failed_timesteps)}
        sub={`of ${nTimesteps.toLocaleString()}`}
        tone={kpis.n_failed_timesteps ? 'bad' : 'good'}
      />
      {extra.map(([k, v]) => (
        <Tile key={k} label={humanize(k)} value={fmtNum(v as number, 3)} />
      ))}
    </div>
  )
}
