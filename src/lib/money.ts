// Money helpers. All money is integer Toman. The server is the source of truth
// for every total — the client never sends a computed total; we recompute.

export function recomputeTotals(opts: {
  items: { unitPrice: number; quantity: number; status: string }[]
  discountAmount: number
  serviceRate: number // percent
  taxRate: number // percent
}): { subtotal: number; service: number; tax: number; total: number } {
  // Cancelled items don't count toward the bill.
  const billable = opts.items.filter((i) => i.status !== 'CANCELLED')
  const subtotal = billable.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const discount = Math.min(opts.discountAmount, subtotal) // never negative taxable
  const taxable = Math.max(0, subtotal - discount)
  const service = Math.round((taxable * opts.serviceRate) / 100)
  const tax = Math.round((taxable * opts.taxRate) / 100)
  const total = taxable + service + tax
  return { subtotal, service, tax, total }
}

export function formatToman(amount: number): string {
  // Iranian convention: group with thousands separators, append " Toman".
  return new Intl.NumberFormat('en-US').format(amount) + ' Toman'
}

export function formatTomanShort(amount: number): string {
  // Compact for UI: 9,385,000 -> "9.4M"
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1) + 'M'
  if (amount >= 1_000) return (amount / 1_000).toFixed(0) + 'k'
  return String(amount)
}
