'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Receipt, Banknote, CreditCard, Percent, CheckCircle2 } from 'lucide-react'
import { api, fmtToman, fmtTime } from '@/lib/client'
import { useApp } from '../layout'
import { toast } from 'sonner'

export default function CashierPage() {
  const { activeBranchId, realtimeTick } = useApp()
  const qc = useQueryClient()
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)

  const orders = useQuery({
    queryKey: ['cashier-orders', activeBranchId, realtimeTick],
    queryFn: () => api<any[]>(`/api/orders?branchId=${activeBranchId}&status=OPEN`).then((r) => r.data),
    enabled: !!activeBranchId,
    refetchInterval: 6000,
  })

  const order = useQuery({
    queryKey: ['order', selected],
    queryFn: () => api<any>(`/api/orders/${selected}`).then((r) => r.data),
    enabled: !!selected,
  })

  if (!activeBranchId) return <div className="text-stone-500 py-12 text-center">No branch assigned.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cashier</h1>
          <p className="text-sm text-stone-500">Open checks. Record payment and close.</p>
        </div>
        {orders.isFetching && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Open checks ({orders.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(orders.data ?? []).length === 0 ? (
            <div className="text-center text-stone-400 text-sm py-10">No open checks. Time for chai.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {(orders.data ?? []).map((o) => (
                <div key={o.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono">#{o.number}</Badge>
                    <div>
                      <div className="text-sm font-medium">{o.table?.label ?? '—'}</div>
                      <div className="text-xs text-stone-500">
                        {o.items?.length ?? 0} items · opened {fmtTime(o.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold mr-2">{fmtToman(o.total)}</div>
                    <Button size="sm" variant="outline" onClick={() => router.push(`/orders/${o.id}`)}>
                      View
                    </Button>
                    <Button size="sm" className="bg-stone-900 hover:bg-stone-800" onClick={() => setSelected(o.id)}>
                      <Banknote className="h-4 w-4 mr-1" /> Take payment
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && order.data && (
        <CheckoutDialog
          order={order.data}
          onClose={() => setSelected(null)}
          onSettled={() => {
            qc.invalidateQueries({ queryKey: ['cashier-orders'] })
            qc.invalidateQueries({ queryKey: ['orders'] })
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}

function CheckoutDialog({ order, onClose, onSettled }: { order: any; onClose: () => void; onSettled: () => void }) {
  const qc = useQueryClient()
  const [discount, setDiscount] = useState('0')
  const [serviceRate, setServiceRate] = useState(String(order.serviceRate ?? 0))
  const [method, setMethod] = useState<'CASH' | 'POS'>('CASH')
  const [busy, setBusy] = useState(false)

  // Recompute locally for display (server is source of truth on submit).
  const subtotal = (order.items ?? []).filter((i: any) => i.status !== 'CANCELLED').reduce((s: number, i: any) => s + i.unitPrice * i.quantity, 0)
  const disc = Math.min(parseInt(discount) || 0, subtotal)
  const taxable = Math.max(0, subtotal - disc)
  const service = Math.round((taxable * (parseInt(serviceRate) || 0)) / 100)
  const total = taxable + service

  async function applyCharges() {
    setBusy(true)
    try {
      await api(`/api/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: order.version,
          discountAmount: parseInt(discount) || 0,
          serviceRate: parseInt(serviceRate) || 0,
        }),
      })
      toast.success('Charges applied')
      qc.invalidateQueries({ queryKey: ['order', order.id] })
      qc.invalidateQueries({ queryKey: ['cashier-orders'] })
    } catch (e: any) {
      toast.error(e.message || 'Could not apply charges — refresh')
    } finally {
      setBusy(false)
    }
  }

  async function recordPayment() {
    setBusy(true)
    try {
      await api(`/api/orders/${order.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ method, amount: total }),
      })
      toast.success(`${method} payment recorded`)
      // Now close the order.
      await api(`/api/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CLOSED' }),
      })
      toast.success('Check closed')
      onSettled()
    } catch (e: any) {
      toast.error(e.message || 'Could not record payment')
      qc.invalidateQueries({ queryKey: ['order', order.id] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check #{order.number} · {order.table?.label}</DialogTitle>
          <DialogDescription>Apply charges, record payment, close the check.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Items */}
          <div className="rounded-md border divide-y divide-stone-100">
            {(order.items ?? []).map((it: any) => (
              <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{it.quantity}× {it.menuItem?.name ?? it.menuItem}</div>
                  {it.notes && <div className="text-xs text-amber-700">{it.notes}</div>}
                </div>
                <div className="font-mono text-xs">{fmtToman(it.unitPrice * it.quantity)}</div>
              </div>
            ))}
          </div>

          {/* Charges */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Discount (Toman)</Label>
              <Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Service charge %</Label>
              <Input type="number" min="0" max="100" value={serviceRate} onChange={(e) => setServiceRate(e.target.value)} />
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={applyCharges} disabled={busy} className="w-full">
            <Percent className="h-3.5 w-3.5 mr-1" /> Apply charges
          </Button>

          {/* Totals */}
          <div className="rounded-md bg-stone-50 p-3 text-sm space-y-1">
            <Row label="Subtotal" value={fmtToman(subtotal)} />
            <Row label="Discount" value={`- ${fmtToman(disc)}`} />
            <Row label={`Service (${serviceRate || 0}%)`} value={fmtToman(service)} />
            <div className="border-t border-stone-200 my-1" />
            <Row label="Total" value={fmtToman(total)} bold />
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={method === 'CASH' ? 'default' : 'outline'}
              onClick={() => setMethod('CASH')}
              className={method === 'CASH' ? 'bg-stone-900 hover:bg-stone-800' : ''}
            >
              <Banknote className="h-4 w-4 mr-1" /> Cash
            </Button>
            <Button
              variant={method === 'POS' ? 'default' : 'outline'}
              onClick={() => setMethod('POS')}
              className={method === 'POS' ? 'bg-stone-900 hover:bg-stone-800' : ''}
            >
              <CreditCard className="h-4 w-4 mr-1" /> POS card
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={recordPayment} disabled={busy} className="bg-stone-900 hover:bg-stone-800">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Record {fmtToman(total)} &amp; close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-base' : ''}`}>
      <span className="text-stone-600">{label}</span>
      <span>{value}</span>
    </div>
  )
}
