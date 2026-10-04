'use client'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChefHat, LogOut, Radio, Wifi, WifiOff } from 'lucide-react'
import { api } from '@/lib/client'
import { useRealtime } from '@/hooks/use-realtime'

interface Branch { id: string; name: string; accessible: boolean }

const ROLE_LABEL: Record<string, string> = {
  MANAGER: 'Manager',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
  CASHIER: 'Cashier',
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [branches, setBranches] = useState<Branch[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)
  const [realtimeTick, setRealtimeTick] = useState(0)

  // Redirect to login if unauthenticated.
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Load branches.
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

  // Realtime: when a branch event arrives, bump a tick so children can
  // refetch via the `key` prop trick or their own subscriptions.
  const { connected } = useRealtime(activeBranchId, () => {
    setRealtimeTick((t) => t + 1)
  })

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-stone-400">Loading…</div>
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
    { href: '/reports', label: 'Reports', roles: ['MANAGER'] },
  ]

  function switchBranch(id: string) {
    setActiveBranchId(id)
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-md bg-stone-900 text-amber-50 flex items-center justify-center">
              <ChefHat className="h-4 w-4" />
            </div>
            <span className="font-semibold">Meshkī</span>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {nav.filter((n) => n.roles.includes(role)).map((n) => {
              const active = pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href))
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition ${
                    active ? 'bg-stone-900 text-amber-50' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 text-xs"
              title={connected ? 'Realtime connected' : 'Realtime disconnected — falling back to polling'}
            >
              {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-600" /> : <WifiOff className="h-3.5 w-3.5 text-amber-600" />}
              <Radio className="h-3 w-3 text-stone-400" />
            </div>

            {branches.filter((b) => b.accessible).length > 0 && (
              <select
                value={activeBranchId ?? ''}
                onChange={(e) => switchBranch(e.target.value)}
                className="text-xs border border-stone-300 rounded-md px-2 py-1 bg-white"
              >
                {branches.filter((b) => b.accessible).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}

            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium leading-tight">{session.user.name}</div>
              <div className="text-[10px] text-stone-500 leading-tight">{ROLE_LABEL[role]}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="h-8 px-2"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-6">
        {/* Realtime tick is passed as a hidden context via a data attribute so
            children that want to refetch on realtime events can read it. We
            also expose branch + role via context below. */}
        <AppContext.Provider value={{ activeBranchId, role, userId: session.user.id, realtimeTick }}>
          {children}
        </AppContext.Provider>
      </main>

      <footer className="border-t border-stone-200 bg-white mt-auto">
        <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-stone-500 flex flex-wrap items-center gap-x-4 gap-y-1 justify-between">
          <span>Meshkī · Restaurant platform · Currency: Toman</span>
          <span>Tenant-isolated · Role-gated · Real-time over WebSocket</span>
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
