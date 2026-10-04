// Shared API helpers. Every route handler returns a NextResponse and fails
// closed: unauthenticated → 401, unauthorized → 403, not-found → 404,
// conflict (concurrency) → 409, validation → 400. We never leak internal
// errors to the client — they go to logs with a correlation id.

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AuthError } from '@/lib/tenant'

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

// Wrap a route handler so errors are handled consistently and logged once.
type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<unknown>

export function apiRoute(handler: Handler): (req: Request, ctx: { params: Promise<Record<string, string>> } | Record<string, string>) => Promise<Response> {
  return async (req, ctxRaw) => {
    const params = (ctxRaw as { params: Promise<Record<string, string>> })?.params instanceof Promise
      ? await (ctxRaw as { params: Promise<Record<string, string>> }).params
      : (ctxRaw as { params: Record<string, string> }).params
    const started = Date.now()
    const corrId = Math.random().toString(36).slice(2, 10)
    try {
      const result = await handler(req, { params: params ?? {} })
      if (result instanceof NextResponse) return result
      if (result === undefined) return ok(null)
      return ok(result)
    } catch (err) {
      // Log with correlation id — this is the line you read at 3am.
      console.log(
        JSON.stringify({
          level: 'error',
          event: 'api_error',
          corrId,
          method: req.method,
          url: req.url,
          status: err instanceof AuthError ? err.status : 500,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error && process.env.NODE_ENV !== 'production' ? err.stack : undefined,
          ms: Date.now() - started,
          ts: new Date().toISOString(),
        }),
      )
      if (err instanceof AuthError) {
        return fail(err.message, err.status, { corrId })
      }
      if (err instanceof ZodError) {
        return fail('Validation error', 400, { issues: err.issues, corrId })
      }
      // Prisma known errors
      const code = (err as { code?: string }).code
      if (code === 'P2002') return fail('Conflict: duplicate', 409, { corrId })
      if (code === 'P2025') return fail('Not found', 404, { corrId })
      return fail('Internal error', 500, { corrId })
    }
  }
}

// Optimistic-concurrency conflict response
export function conflict(message = 'Concurrent modification; refresh and retry', detail?: unknown) {
  return NextResponse.json({ ok: false, error: message, detail }, { status: 409 })
}
