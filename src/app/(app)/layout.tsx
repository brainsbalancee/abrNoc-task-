'use client'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChefHat, LogOut, Wifi, WifiOff, ChevronDown } from 'lucide-react'
import { api } from '@/lib/client'
import { useRealtime } from '@/hooks/use-realtime'
import { ThemeToggle } from '@/components/theme-toggle'

interface Branch { id: string; name: string; accessible: boolean }

const ROLE_LABEL: Record<string, string> = {
  MANAGER: 'Manager',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
  CASHIER: 'Cashier',
}

const ROLE_BADGE: Record<string, string> = {
  MANAGER: 'bg-primary/15 text-primary',
  WAITER: 'bg-chart-2/15 text-chart-2',
  KITCHEN: 'bg-chart-5/15 text-chart-5',
  CASHIER: 'bg-chart-4/15 text-chart-4',
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [branches, setBranches] = useState<Branch[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)
  const [realtimeTick, setRealtimeTick] = useState(0)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    api<Branch[]>('/api/branches').then((r) => {
      setBranches(r.data)
      const accessible = r.data.filter((b) => b.accessible)
      const initial = (session?.user?.activeBranchId && r.data.find(b=>b.id===session.user.activeBranchId)?.accessible)
        ? session.user.activeBranchId
        : accessible[0]?.id ?? null
      setActiveBranchId(initial)
    }).catch(() => {})
  }, [status, session?.user?.activeBranchId])

  const { connected } = useRealtime(activeBranchId, () => {
    setRealtimeTick((t) => t + 1)
  })

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    )
  }
  if (!session?.user) return null

  const role = session.user.role
  const nav: { href: string; label: string; roles: string[] }[] = [
    { href: '/', label: 'Dashboard', roles: ['MANAGER', 'WAITER', 'KITCHEN', 'CASHIER'] },
    { href: '/waiter', label: 'Waiter', roles: ['WAITER', 'MANAGER'] },
    { href: '/kitchen', label: 'Kitchen', roles: ['KITCHEN', 'MANAGER'] },
    { href: '/cashier', label: 'Cashier', roles: ['CASHIER', 'MANAGER'] },
    { href: '/menu', label: 'Menu', roles: ['MANAGER', 'WAITER', 'KITCHEN', 'CASHIER'] },
    { href: '/reports', label: 'Reports', roles: ['MANAGER'] },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <ChefHat className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight hidden xs:inline sm:inline">Meshkī</span>
          </Link>

          {/* Nav: flex-1 + min-w-0 lets it shrink and scroll horizontally on mobile */}
          <nav className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {nav.filter((n) => n.roles.includes(role)).map((n) => {
              const active = pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href))
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition ${
                    active
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>

          {/* Right cluster: shrink-0 so it never compresses; hide non-essential on mobile */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Realtime indicator — desktop only (mobile has polling fallback) */}
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs px-2 py-1 rounded-md"
              title={connected ? 'Realtime connected' : 'Realtime disconnected — falling back to polling'}
            >
              {connected ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
              )}
            </div>

            {/* Branch selector — tablet+ only (managers typically use larger screens) */}
            {branches.filter((b) => b.accessible).length > 1 && (
              <div className="relative hidden sm:block">
                <select
                  value={activeBranchId ?? ''}
                  onChange={(e) => setActiveBranchId(e.target.value)}
                  className="appearance-none text-xs border border-border/60 rounded-md pl-2.5 pr-7 py-1.5 bg-card text-foreground cursor-pointer hover:border-border focus:outline-none focus:ring-1 focus:ring-ring max-w-[120px] truncate"
                >
                  {branches.filter((b) => b.accessible).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
            )}

            <ThemeToggle />

            <div className="flex items-center gap-2 pl-1.5 sm:pl-2 sm:ml-1 sm:border-l sm:border-border/60">
              <div className="text-right hidden md:block">
                <div className="text-xs font-medium leading-tight">{session.user.name}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{ROLE_LABEL[role]}</div>
              </div>
              <span className={`hidden sm:inline text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded ${ROLE_BADGE[role] ?? 'bg-muted text-muted-foreground'}`}>
                {role}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  signOut({ redirect: false }).then(() => {
                    router.push('/login')
                    router.refresh()
                  })
                }}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-7xl w-full px-3 sm:px-4 py-6">
        <AppContext.Provider value={{ activeBranchId, role, userId: session.user.id, realtimeTick }}>
          {children}
        </AppContext.Provider>
      </main>

      <footer className="border-t border-border/60 bg-card/50 mt-auto">
        <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 justify-between">
          <span>Meshkī · Restaurant platform · Currency: Toman</span>
          <span className="hidden sm:inline">Tenant-isolated · Role-gated · Real-time over WebSocket</span>
        </div>
      </footer>
    </div>
  )
}

import { createContext, useContext } from 'react'

interface AppCtx {
  activeBranchId: string | null
  role: string
  userId: string
  realtimeTick: number
}
export const AppContext = createContext<AppCtx>({
  activeBranchId: null,
  role: 'WAITER',
  userId: '',
  realtimeTick: 0,
})
export function useApp() {
  return useContext(AppContext)
}
