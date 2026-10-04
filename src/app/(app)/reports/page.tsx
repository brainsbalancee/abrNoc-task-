'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, RefreshCw, Lock, Receipt, Wallet, TrendingUp, Clock, AlertTriangle } from 'lucide-react'
import { api, fmtToman, fmtTime } from '@/lib/client'
import { useApp } from '../layout'
import { toast } from 'sonner'

export default function ReportsPage() {
  const { activeBranchId, realtimeTick } = useApp()
  const qc = useQueryClient()
  const [closing, setClosing] = useState(false)
  const [regen, setRegen] = useState(false)

  const current = useQuery({
    queryKey: ['shift-current', activeBranchId, realtimeTick],
    queryFn: () => api<any>(`/api/shifts/current?branchId=${activeBranchId}`).then((r) => r.data),
    enabled: !!activeBranchId,
    refetchInterval: 10000,
  })

  // We also fetch the most recent CLOSED shift's full record (with summary).
  // The current shift response doesn't include closed shifts, so we list via
  // a dedicated endpoint that returns the latest closed shift for the branch.
  const lastClosed = useQuery({
    queryKey: ['shift-last-closed', activeBranchId],
    queryFn: async () => {
      // The current endpoint returns null if none open, so we peek at the
      // closed shift via a tiny inline query using the orders endpoint shape.
      // For simplicity we fetch the latest closed shift by hitting the shifts
      // API through the current response's previous — but we don't have a
      // list endpoint. Instead we hit a dedicated route below.
      const r = await api<any>(`/api/shifts/last-closed?branchId=${activeBranchId}`).catch(() => null)
      return r?.data ?? null
    },
    enabled: !!activeBranchId,
  })

  async function closeShift() {
    if (!current.data) return
    if (!confirm('Close this shift? Open checks must be closed first. The AI summary will generate (may take 10–15s).')) return
    setClosing(true)
    try {
      const r = await api<any>('/api/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ branchId: activeBranchId }),
      })
      toast.success(`Shift closed · summary via ${r.data.source}`)
      qc.invalidateQueries({ queryKey: ['shift-current'] })
      qc.invalidateQueries({ queryKey: ['shift-last-closed'] })
    } catch (e: any) {
      toast.error(e.message || 'Could not close shift')
    } finally {
      setClosing(false)
    }
  }

  async function regenerate() {
    if (!lastClosed.data) return
    setRegen(true)
    try {
      const r = await api<any>(`/api/reports/shift-summary?shiftId=${lastClosed.data.id}`, { method: 'POST' })
      toast.success(`Summary regenerated · via ${r.data.source}`)
      qc.invalidateQueries({ queryKey: ['shift-last-closed'] })
    } catch (e: any) {
      toast.error(e.message || 'Could not regenerate')
    } finally {
      setRegen(false)
    }
  }

  if (!activeBranchId) return <div className="text-stone-500 py-12 text-center">No branch assigned.</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-stone-500">Shift summaries generated from your live data. The AI narrative is a convenience — every number is computed deterministically from the database.</p>
      </div>

      {/* Open shift */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {current.data ? <><span>Open shift</span> <Badge className="bg-emerald-100 text-emerald-800">live</Badge></> : <><span>No open shift</span> <Badge variant="outline">closed</Badge></>}
          </CardTitle>
          <CardDescription>
            {current.data ? `Opened ${fmtTime(current.data.openedAt)} · ${current.data.liveStats?.openOrders ?? 0} open / ${current.data.liveStats?.closedOrders ?? 0} closed` : 'Open a shift by creating the first order of the day, or close the previous one first.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {current.data && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <MiniStat icon={<Receipt className="h-3.5 w-3.5" />} label="Open checks" value={String(current.data.liveStats?.openOrders ?? 0)} />
                <MiniStat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Closed" value={String(current.data.liveStats?.closedOrders ?? 0)} />
                <MiniStat icon={<Wallet className="h-3.5 w-3.5" />} label="Gross so far" value={fmtToman(current.data.liveStats?.grossSoFar ?? 0)} />
              </div>
              <Button onClick={closeShift} disabled={closing || (current.data.liveStats?.openOrders ?? 0) > 0} className="bg-stone-900 hover:bg-stone-800">
                {closing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Closing & generating summary…</> : <><Lock className="h-4 w-4 mr-1" /> Close shift & generate AI summary</>}
              </Button>
              {(current.data.liveStats?.openOrders ?? 0) > 0 && (
                <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Close all open checks before closing the shift.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last closed shift with AI summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-600" /> Last shift summary</span>
            {lastClosed.data && (
              <Button size="sm" variant="outline" onClick={regenerate} disabled={regen}>
                {regen ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Regenerate
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            {lastClosed.data
              ? `Closed ${fmtTime(lastClosed.data.closedAt)} · ${lastClosed.data.orderCount} checks · ${fmtToman(lastClosed.data.grossTotal)} gross`
              : 'No closed shifts yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lastClosed.isFetching ? (
            <div className="text-center text-stone-400 py-6"><Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Loading…</div>
          ) : lastClosed.data ? (
            <div className="space-y-3">
              <div className="rounded-md bg-gradient-to-br from-amber-50 to-stone-50 border border-amber-200 p-4">
                <div className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {lastClosed.data.aiModel === 'deterministic-fallback' ? 'Summary (offline template — AI was unavailable)' : `AI summary · model: ${lastClosed.data.aiModel ?? 'unknown'}`}
                </div>
                <p className="text-sm text-stone-800 leading-relaxed">{lastClosed.data.aiSummary ?? 'No summary generated.'}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <MiniStat icon={<Receipt className="h-3 w-3" />} label="Checks" value={String(lastClosed.data.orderCount)} />
                <MiniStat icon={<Wallet className="h-3 w-3" />} label="Gross" value={fmtToman(lastClosed.data.grossTotal)} />
                <MiniStat icon={<Clock className="h-3 w-3" />} label="Opened" value={fmtTime(lastClosed.data.openedAt)} />
                <MiniStat icon={<AlertTriangle className="h-3 w-3" />} label="Voids" value={String(lastClosed.data.voidCount ?? 0)} />
              </div>
            </div>
          ) : (
            <div className="text-center text-stone-400 text-sm py-6">No closed shifts yet.</div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-stone-400 max-w-2xl">
        <strong className="text-stone-600">About this summary:</strong> the AI receives only structured numbers and dish names — never customer data, never free-text notes. If the AI provider is down or slow, the system falls back to a deterministic template built from the same data, so you always get your shift report. See <code>DECISIONS.md</code> for the full reasoning.
      </div>
    </div>
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-2">
      <div className="flex items-center gap-1 text-stone-500 text-[10px] uppercase tracking-wide">{icon}{label}</div>
      <div className="font-semibold mt-0.5 truncate">{value}</div>
    </div>
  )
}
