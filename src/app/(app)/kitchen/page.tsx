'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Flame, CheckCheck, Clock } from 'lucide-react'
import { api, fmtTime, minutesSince } from '@/lib/client'
import { useApp } from '../layout'
import { toast } from 'sonner'

const STATION_COLORS: Record<string, string> = {
  grill: 'bg-red-50 text-red-700 border-red-200',
  kitchen: 'bg-amber-50 text-amber-700 border-amber-200',
  cold: 'bg-sky-50 text-sky-700 border-sky-200',
  bar: 'bg-violet-50 text-violet-700 border-violet-200',
  main: 'bg-stone-50 text-stone-700 border-stone-200',
}

export default function KitchenPage() {
  const { activeBranchId, realtimeTick } = useApp()
  const qc = useQueryClient()

  const orders = useQuery({
    queryKey: ['kitchen-orders', activeBranchId, realtimeTick],
    queryFn: () => api<any[]>(`/api/orders?branchId=${activeBranchId}&status=OPEN`).then((r) => r.data),
    enabled: !!activeBranchId,
    refetchInterval: 8000,
  })

  // Flatten items across open orders, with their order context.
  type FlatItem = {
    itemId: string
    orderId: string
    orderNumber: number
    tableLabel: string
    itemName: string
    quantity: number
    notes?: string
    status: string
    version: number
    station: string
    createdAt: string
  }
  const items: FlatItem[] = (orders.data ?? []).flatMap((o: any) =>
    (o.items ?? []).map((it: any) => ({
      itemId: it.id,
      orderId: o.id,
      orderNumber: o.number,
      tableLabel: o.table?.label ?? '—',
      itemName: it.menuItem?.name ?? it.menuItem ?? 'Unknown',
      quantity: it.quantity,
      notes: it.notes,
      status: it.status,
      version: it.version,
      station: it.menuItem?.kitchenStation ?? 'main',
      createdAt: it.createdAt,
    })),
  )

  const pending = items.filter((i) => i.status === 'PENDING')
  const preparing = items.filter((i) => i.status === 'PREPARING')
  const ready = items.filter((i) => i.status === 'READY')

  async function advance(item: FlatItem) {
    const next = item.status === 'PENDING' ? 'PREPARING' : 'READY'
    try {
      await api(`/api/orders/${item.orderId}/items/${item.itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, expectedVersion: item.version }),
      })
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      toast.success(`${item.itemName} → ${next}`)
    } catch (e: any) {
      toast.error(e.message || 'Could not update — refresh and retry')
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
    }
  }

  if (!activeBranchId) return <div className="text-stone-500 py-12 text-center">No branch assigned.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kitchen display</h1>
          <p className="text-sm text-stone-500">Live tickets. Tap to advance an item through cooking.</p>
        </div>
        {orders.isFetching && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* PENDING */}
        <Column title="New tickets" icon={<Clock className="h-4 w-4" />} count={pending.length} tone="stone">
          {pending.map((it) => (
            <ItemCard key={it.itemId} item={it} actionLabel="Start cooking →" onAction={() => advance(it)} />
          ))}
        </Column>
        {/* PREPARING */}
        <Column title="Cooking" icon={<Flame className="h-4 w-4" />} count={preparing.length} tone="amber">
          {preparing.map((it) => (
            <ItemCard key={it.itemId} item={it} actionLabel="Mark ready →" onAction={() => advance(it)} />
          ))}
        </Column>
        {/* READY */}
        <Column title="Ready to serve" icon={<CheckCheck className="h-4 w-4" />} count={ready.length} tone="emerald">
          {ready.map((it) => (
            <ItemCard key={it.itemId} item={it} actionLabel="Waiting for waiter" onAction={() => {}} disabled />
          ))}
        </Column>
      </div>
    </div>
  )
}

function Column({ title, icon, count, tone, children }: { title: string; icon: React.ReactNode; count: number; tone: 'stone' | 'amber' | 'emerald'; children: React.ReactNode }) {
  const toneClass = {
    stone: 'border-stone-200 bg-stone-50/50',
    amber: 'border-amber-200 bg-amber-50/50',
    emerald: 'border-emerald-200 bg-emerald-50/50',
  }[tone]
  return (
    <Card className={toneClass}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
          <Badge variant="secondary" className="ml-auto">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
        {count === 0 ? <div className="text-center text-xs text-stone-400 py-6">Nothing here.</div> : children}
      </CardContent>
    </Card>
  )
}

function ItemCard({ item, actionLabel, onAction, disabled }: { item: any; actionLabel: string; onAction: () => void; disabled?: boolean }) {
  const age = minutesSince(item.createdAt)
  const stationColor = STATION_COLORS[item.station] ?? STATION_COLORS.main
  const ageTone = age > 10 ? 'text-red-600' : age > 5 ? 'text-amber-600' : 'text-stone-500'
  return (
    <div className="rounded-md border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="font-mono">#{item.orderNumber}</span>
            <span>·</span>
            <span className="font-medium">{item.tableLabel}</span>
          </div>
          <div className="font-medium text-sm mt-0.5 truncate">{item.itemName}</div>
          {item.notes && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">
              {item.notes}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-semibold">×{item.quantity}</div>
          <div className={`text-[10px] ${ageTone}`}>{age}m ago</div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${stationColor}`}>{item.station}</span>
        <Button size="sm" variant="default" onClick={onAction} disabled={disabled} className="h-7 text-xs bg-stone-900 hover:bg-stone-800">
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}
