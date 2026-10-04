'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Users, Receipt, Plus } from 'lucide-react'
import { api, fmtToman } from '@/lib/client'
import { useApp } from '../layout'
import { toast } from 'sonner'

export default function WaiterPage() {
  const { activeBranchId, userId, realtimeTick } = useApp()
  const router = useRouter()
  const qc = useQueryClient()

  const tables = useQuery({
    queryKey: ['tables', activeBranchId],
    queryFn: () => api<any[]>(`/api/tables?branchId=${activeBranchId}`).then((r) => r.data),
    enabled: !!activeBranchId,
  })

  const orders = useQuery({
    queryKey: ['waiter-orders', activeBranchId, realtimeTick],
    queryFn: () => api<any[]>(`/api/orders?branchId=${activeBranchId}&status=OPEN`).then((r) => r.data),
    enabled: !!activeBranchId,
    refetchInterval: 6000,
  })

  // Index orders by tableId for quick lookup.
  const orderByTable = new Map<string, any>()
  for (const o of orders.data ?? []) {
    if (o.tableId) orderByTable.set(o.tableId, o)
  }

  async function openOrCreate(tableId: string, label: string) {
    const existing = orderByTable.get(tableId)
    if (existing) {
      router.push(`/orders/${existing.id}`)
      return
    }
    // Create a new check for this table.
    try {
      const r = await api<any>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ branchId: activeBranchId, tableId }),
      })
      toast.success(`Opened check #${r.data.number} for ${label}`)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['waiter-orders'] })
      router.push(`/orders/${r.data.id}`)
    } catch (e: any) {
      toast.error(e.message || 'Could not open check')
    }
  }

  if (!activeBranchId) return <div className="text-stone-500 py-12 text-center">No branch assigned.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Waiter</h1>
          <p className="text-sm text-stone-500">Pick a table. Tap an occupied table to continue its check, or an empty one to open a new check.</p>
        </div>
        {orders.isFetching && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {(tables.data ?? []).map((t) => {
          const order = orderByTable.get(t.id)
          const occupied = !!order
          return (
            <button
              key={t.id}
              onClick={() => openOrCreate(t.id, t.label)}
              className={`text-left rounded-lg border p-4 transition hover:shadow-md ${
                occupied ? 'border-stone-900 bg-stone-900 text-amber-50' : 'border-stone-200 bg-white hover:border-stone-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-lg">{t.label}</span>
                {occupied ? <Receipt className="h-4 w-4" /> : <Plus className="h-4 w-4 opacity-50" />}
              </div>
              <div className="flex items-center gap-1 text-xs mt-1 opacity-70">
                <Users className="h-3 w-3" />
                <span>{t.seats} seats</span>
              </div>
              {occupied ? (
                <div className="mt-3 text-xs space-y-0.5">
                  <div className="font-mono">#{order.number}</div>
                  <div>{order.items?.length ?? 0} items</div>
                  <div className="font-semibold">{fmtToman(order.total)}</div>
                </div>
              ) : (
                <div className="mt-3 text-xs opacity-60">Open new check →</div>
              )}
            </button>
          )
        })}
        {tables.data?.length === 0 && (
          <div className="col-span-full text-center text-stone-400 text-sm py-10">No tables configured for this branch.</div>
        )}
      </div>
    </div>
  )
}
