import { Activity, FolderKanban, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { cn } from '../../lib/utils'
import { HealthIndicator } from './HealthIndicator'

function NavItem({ to, icon, children, end }: { to: string; icon: ReactNode; children: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-surface-3 hover:text-fg',
        )
      }
    >
      {icon}
      <span className="hidden lg:inline">{children}</span>
    </NavLink>
  )
}

export function AppShell() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-14 shrink-0 flex-col border-r border-border bg-surface lg:w-52">
        <div className="flex h-14 items-center gap-2 border-b border-border px-3.5">
          <div className="grid size-7 place-items-center rounded-md bg-accent text-accent-fg">
            <Zap size={16} strokeWidth={2.5} />
          </div>
          <span className="hidden text-[15px] font-semibold tracking-tight lg:inline">GridSim</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          <NavItem to="/" end icon={<FolderKanban size={16} />}>
            Cases
          </NavItem>
          <NavItem to="/runs" icon={<Activity size={16} />}>
            Runs
          </NavItem>
        </nav>
        <div className="mt-auto hidden p-3 text-[11px] leading-snug text-fg-muted lg:block">
          Time-series load flow studies on power-grid-model.
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-5">
          <div className="text-sm font-semibold text-fg">
            GridSim <span className="font-normal text-fg-muted">· time-series load flow</span>
          </div>
          <HealthIndicator />
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
