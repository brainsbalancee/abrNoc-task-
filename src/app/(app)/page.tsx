'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChefHat, ClipboardList, Receipt, BarChart3, ArrowRight, Wallet } from 'lucide-react'
import { api, fmtToman, fmtTime } from '@/lib/client'
import { useApp } from './layout'

export default function DashboardPage() {
  const { activeBranchId, role } = useApp()

  const shift = useQuery({
    queryKey: ['shift', activeBranchId],
    queryFn: () => api<any>(`/api/shifts/current?branchId=${activeBranchId}`).then((r) => r.data),
    enabled: !!activeBranchId,
    refetchInterval: 5000,
  })

  const orders = useQuery({
    queryKey: ['orders', activeBranchId],
    queryFn: () => api<any[]>(`/api/orders?branchId=${activeBranchId}&status=OPEN`).then((r) => r.data),
    enabled: !!activeBranchId,
    refetchInterval: 5000,
  })

  if (!activeBranchId) {
    return <div className="text-center text-stone-500 py-12">No branch assigned. Contact your manager.</div>
  }

  const liveStats = shift.data?.liveStats
  const openOrders = orders.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-stone-500">
          {role === 'MANAGER' && 'Overview of the active shift and your team.'}
          {role === 'WAITER' && 'Your tables and open checks.'}
          {role === 'KITCHEN' && 'Incoming tickets and what is cooking.'}
          {role === 'CASHIER' && 'Open checks to close and payments to record.'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="Open checks"
          value={String(liveStats?.openOrders ?? 0)}
        />
        <StatCard
          icon={<Receipt className="h-4 w-4" />}
          label="Closed today"
          value={String(liveStats?.closedOrders ?? 0)}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Gross so far"
          value={fmtToman(liveStats?.grossSoFar ?? 0)}
        />
        <StatCard
          icon={<ChefHat className="h-4 w-4" />}
          label="Shift"
          value={shift.data ? `Since ${fmtTime(shift.data.openedAt)}` : 'Not open'}
        />
      </div>

      {/* Role shortcuts */}
      <div className="grid md:grid-cols-3 gap-3">
        {['WAITER', 'MANAGER'].includes(role) && (
          <ShortcutCard href="/waiter" title="Waiter" desc="Take a new order or edit an open check." icon={<ClipboardList className="h-5 w-5" />} />
        )}
        {['KITCHEN', 'MANAGER'].includes(role) && (
          <ShortcutCard href="/kitchen" title="Kitchen" desc="Live ticket display. Mark items cooking / ready." icon={<ChefHat className="h-5 w-5" />} />
        )}
        {['CASHIER', 'MANAGER'].includes(role) && (
          <ShortcutCard href="/cashier" title="Cashier" desc="Apply discounts, record payment, close checks." icon={<Receipt className="h-5 w-5" />} />
        )}
        {role === 'MANAGER' && (
          <ShortcutCard href="/reports" title="Reports" desc="Shift summaries and the AI-generated narrative." icon={<BarChart3 className="h-5 w-5" />} />
        )}
      </div>

      {/* Open checks list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Open checks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {openOrders.length === 0 ? (
            <div className="text-center text-stone-400 text-sm py-10">No open checks right now.</div>
          ) : (
            <div className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
              {openOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono">#{o.number}</Badge>
                    <div>
                      <div className="text-sm font-medium">{o.table?.label ?? '—'}</div>
                      <div className="text-xs text-stone-500">
                        {o.items?.length ?? 0} items · opened {fmtTime(o.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{fmtToman(o.total)}</div>
                    <div className="flex items-center gap-1 text-xs text-stone-400">
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-stone-500">
        <span className="text-xs">{label}</span>
        {icon}
      </div>
      <div className="text-lg font-semibold mt-1 truncate">{value}</div>
    </Card>
  )
}

function ShortcutCard({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <Card className="p-4 hover:border-stone-400 transition h-full">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-stone-100 flex items-center justify-center text-stone-700 shrink-0">{icon}</div>
          <div>
            <div className="font-medium text-sm">{title}</div>
            <div className="text-xs text-stone-500 mt-0.5">{desc}</div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
