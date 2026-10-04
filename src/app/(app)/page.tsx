'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChefHat, ClipboardList, Receipt, BarChart3, ArrowRight, Wallet, Clock, Loader2 } from 'lucide-react'
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
    return (
      <div className="text-center py-20">
        <ChefHat className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">No branch assigned. Contact your manager.</p>
      </div>
    )
  }

  const liveStats = shift.data?.liveStats
  const openOrders = orders.data ?? []
  const loading = shift.isLoading || orders.isLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {role === 'MANAGER' && 'Overview of the active shift and your team.'}
            {role === 'WAITER' && 'Your tables and open checks.'}
            {role === 'KITCHEN' && 'Incoming tickets and what is cooking.'}
            {role === 'CASHIER' && 'Open checks to close and payments to record.'}
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="Open checks"
          value={String(liveStats?.openOrders ?? 0)}
          tone="primary"
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
          icon={<Clock className="h-4 w-4" />}
          label="Shift"
          value={shift.data ? `Since ${fmtTime(shift.data.openedAt)}` : 'Not open'}
        />
      </div>

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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Open checks</CardTitle>
            <Badge variant="secondary" className="font-mono">{openOrders.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {openOrders.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-12">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No open checks right now.
            </div>
          ) : (
            <div className="divide-y divide-border/60 max-h-96 overflow-y-auto">
              {openOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition group"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono">#{o.number}</Badge>
                    <div>
                      <div className="text-sm font-medium">{o.table?.label ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.items?.length ?? 0} items · opened {fmtTime(o.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">{fmtToman(o.total)}</div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition" />
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

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'primary' }) {
  return (
    <Card className={`p-4 ${tone === 'primary' ? 'border-primary/30 bg-primary/5' : ''}`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium">{label}</span>
        <span className={tone === 'primary' ? 'text-primary' : ''}>{icon}</span>
      </div>
      <div className="text-lg font-semibold mt-1 truncate">{value}</div>
    </Card>
  )
}

function ShortcutCard({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <Card className="p-4 hover:border-primary/40 hover:shadow-sm transition h-full group">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition shrink-0">
            {icon}
          </div>
          <div>
            <div className="font-medium text-sm">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
