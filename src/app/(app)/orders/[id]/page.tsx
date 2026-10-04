'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Plus, Minus, X, Flame, Check, Utensils, ChefHat, AlertCircle } from 'lucide-react'
import { api, fmtToman, fmtTime, minutesSince } from '@/lib/client'
import { useApp } from '../../layout'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  PENDING: { label: 'Pending', cls: 'bg-stone-100 text-stone-700', icon: AlertCircle },
  PREPARING: { label: 'Cooking', cls: 'bg-amber-100 text-amber-800', icon: Flame },
  READY: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-800', icon: Check },
  SERVED: { label: 'Served', cls: 'bg-stone-200 text-stone-500 line-through', icon: Utensils },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700 line-through', icon: X },
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { activeBranchId, role, realtimeTick } = useApp()
  const qc = useQueryClient()
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({})
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const { data: session } = useSession()

  const order = useQuery({
    queryKey: ['order', id, realtimeTick],
    queryFn: () => api<any>(`/api/orders/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: 5000,
  })

  const menu = useQuery({
    queryKey: ['menu'],
    queryFn: () => api<any[]>('/api/menu').then((r) => r.data),
  })

  if (order.isLoading || !order.data) {
    return <div className="text-center text-stone-400 py-12"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading order…</div>
  }
  const o = order.data

  // Permission to add items (waiter or manager).
  const canEdit = role === 'WAITER' || role === 'MANAGER'
  const canServe = role === 'WAITER' || role === 'CASHIER' || role === 'MANAGER'
  const canCook = role === 'KITCHEN' || role === 'MANAGER'

  async function addItems() {
    const items = Object.entries(qtyMap)
      .filter(([, q]) => q > 0)
      .map(([menuItemId, quantity]) => ({
        menuItemId,
        quantity,
        notes: noteMap[menuItemId] || undefined,
      }))
    if (items.length === 0) {
      toast.info('Pick at least one item with a quantity.')
      return
    }
    try {
      await api(`/api/orders/${id}/items`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      })
      toast.success(`Added ${items.length} item line(s)`)
      setQtyMap({})
      setNoteMap({})
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e: any) {
      toast.error(e.message || 'Could not add items')
    }
  }

  async function advanceItem(itemId: string, current: string, version: number) {
    let next = ''
    if (current === 'PENDING') next = 'PREPARING'
    else if (current === 'PREPARING') next = 'READY'
    else if (current === 'READY') next = 'SERVED'
    else return
    try {
      await api(`/api/orders/${id}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, expectedVersion: version }),
      })
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
    } catch (e: any) {
      toast.error(e.message || 'Conflict — refresh and retry')
      qc.invalidateQueries({ queryKey: ['order', id] })
    }
  }

  async function cancelItem(itemId: string, current: string, version: number) {
    if (current !== 'PENDING' && current !== 'PREPARING') return
    if (!confirm('Cancel this item? It will be removed from the bill.')) return
    try {
      await api(`/api/orders/${id}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED', expectedVersion: version }),
      })
      toast.success('Item cancelled')
      qc.invalidateQueries({ queryKey: ['order', id] })
    } catch (e: any) {
      toast.error(e.message || 'Could not cancel — refresh and retry')
      qc.invalidateQueries({ queryKey: ['order', id] })
    }
  }

  const subtotal = (o.items ?? []).filter((i: any) => i.status !== 'CANCELLED').reduce((s: number, i: any) => s + i.unitPrice * i.quantity, 0)
  const disc = o.discountAmount ?? 0
  const taxable = Math.max(0, subtotal - disc)
  const service = Math.round((taxable * (o.serviceRate ?? 0)) / 100)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="font-mono text-sm">#{o.number}</Badge>
        <h1 className="text-xl font-semibold">{o.table?.label ?? 'No table'}</h1>
        <Badge className={o.status === 'OPEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}>
          {o.status}
        </Badge>
        <span className="text-xs text-stone-500">opened {fmtTime(o.createdAt)} · {minutesSince(o.createdAt)}m ago</span>
        {session?.user?.name && o.waiterId === session.user.id && (
          <Badge variant="outline" className="text-xs">your check</Badge>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: items list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Items ({o.items?.length ?? 0})</span>
              <span className="text-xs text-stone-500 font-normal">live · OCC protected</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {o.items?.length === 0 ? (
              <div className="text-center text-stone-400 text-sm py-10">No items yet. Add from the menu →</div>
            ) : (
              <div className="divide-y divide-stone-100">
                {o.items.map((it: any) => {
                  const meta = STATUS_META[it.status] ?? STATUS_META.PENDING
                  const Icon = meta.icon
                  const canAdvance =
                    (it.status === 'PENDING' && canCook) ||
                    (it.status === 'PREPARING' && canCook) ||
                    (it.status === 'READY' && canServe)
                  const nextLabel = it.status === 'PENDING' ? 'Start cooking' : it.status === 'PREPARING' ? 'Mark ready' : it.status === 'READY' ? 'Mark served' : ''
                  return (
                    <div key={it.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{it.quantity}×</span>
                          <span className={`text-sm ${meta.cls.includes('line-through') ? 'line-through' : ''}`}>
                            {it.menuItem?.name ?? it.menuItem}
                          </span>
                        </div>
                        {it.notes && <div className="text-xs text-amber-700 mt-0.5">⚠ {it.notes}</div>}
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          {it.menuItem?.kitchenStation} · {fmtToman(it.unitPrice * it.quantity)}
                        </div>
                      </div>
                      <Badge className={meta.cls + ' text-xs'}>
                        <Icon className="h-3 w-3 mr-1" />
                        {meta.label}
                      </Badge>
                      {canAdvance && (
                        <Button size="sm" variant="default" className="h-7 text-xs bg-stone-900 hover:bg-stone-800" onClick={() => advanceItem(it.id, it.status, it.version)}>
                          {nextLabel}
                        </Button>
                      )}
                      {canEdit && (it.status === 'PENDING' || it.status === 'PREPARING') && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => cancelItem(it.id, it.status, it.version)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {/* Totals */}
            <div className="border-t bg-stone-50 p-4 text-sm space-y-1">
              <div className="flex justify-between text-stone-600"><span>Subtotal</span><span>{fmtToman(subtotal)}</span></div>
              {disc > 0 && <div className="flex justify-between text-stone-600"><span>Discount</span><span>- {fmtToman(disc)}</span></div>}
              {service > 0 && <div className="flex justify-between text-stone-600"><span>Service ({o.serviceRate ?? 0}%)</span><span>{fmtToman(service)}</span></div>}
              <div className="flex justify-between font-semibold text-base border-t border-stone-200 pt-1"><span>Total</span><span>{fmtToman(o.total)}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Right: menu (waiter/manager only) */}
        {canEdit && o.status === 'OPEN' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Add items</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[60vh] pr-3">
                <div className="space-y-4">
                  {(menu.data ?? []).map((cat) => (
                    <div key={cat.id}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1.5">{cat.name}</div>
                      <div className="space-y-1">
                        {cat.items?.map((it: any) => (
                          <div key={it.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-stone-50 border border-transparent hover:border-stone-200">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{it.name}</div>
                              <div className="text-[10px] text-stone-400">{fmtToman(it.price)}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setQtyMap((m) => ({ ...m, [it.id]: Math.max(0, (m[it.id] ?? 0) - 1) }))}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                className="h-7 w-10 text-center px-0"
                                value={qtyMap[it.id] ?? 0}
                                onChange={(e) => setQtyMap((m) => ({ ...m, [it.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                              />
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setQtyMap((m) => ({ ...m, [it.id]: (m[it.id] ?? 0) + 1 }))}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1 bg-stone-900 hover:bg-stone-800" onClick={addItems}>
                  <Plus className="h-4 w-4 mr-1" /> Add to check
                </Button>
              </div>
              <p className="text-[10px] text-stone-400 mt-1">
                Adding items is append-only — two waiters can add to the same check without losing each other's work.
              </p>
            </CardContent>
          </Card>
        )}

        {!canEdit && (
          <Card className="p-6">
            <div className="text-sm text-stone-500">
              {role === 'KITCHEN' && <div className="flex items-center gap-2"><ChefHat className="h-4 w-4" /> You are viewing in Kitchen mode. Use the Kitchen display to advance items.</div>}
              {role === 'CASHIER' && <div>Use the Cashier page to take payment and close this check.</div>}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
