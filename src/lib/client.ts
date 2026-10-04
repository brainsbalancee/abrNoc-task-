'use client'
// Fetch helper for the browser. Reads relative URLs only (Caddy handles routing).
// Throws on non-ok responses with the server's error message.

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; data: T; error?: string }> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  })
  const json = await res.json().catch(() => ({ ok: false, error: 'bad json' }))
  if (!res.ok || !json.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return json as { ok: boolean; data: T }
}

export function fmtToman(n: number): string {
  return new Intl.NumberFormat('en-US').format(n) + ' T'
}

export function fmtTime(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function minutesSince(d: string | Date): number {
  const date = typeof d === 'string' ? new Date(d) : d
  return Math.floor((Date.now() - date.getTime()) / 60000)
}
