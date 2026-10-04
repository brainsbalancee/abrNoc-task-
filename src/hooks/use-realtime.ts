'use client'
// Browser-side Socket.io client for Meshkī realtime.
//
// Reads the NextAuth session cookie and passes it as the socket auth token.
// The realtime mini-service verifies it with jose + the shared NEXTAUTH_SECRET
// and auto-joins the client to branch rooms for branches in their JWT. The
// client CANNOT join arbitrary rooms — membership is server-controlled, so a
// malicious client cannot eavesdrop on another tenant's branch.

import { io, Socket } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'

function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null
  // NextAuth cookie names: __Secure-next-auth.session-token (https) or
  // next-auth.session-token (http dev). Read both robustly.
  const cookies = document.cookie.split('; ')
  for (const name of ['__Secure-next-auth.session-token', 'next-auth.session-token']) {
    const found = cookies.find((c) => c.startsWith(name + '='))
    if (found) return decodeURIComponent(found.slice(name.length + 1))
  }
  return null
}

export interface RealtimeEvent {
  type: string
  orderId?: string
  payload: unknown
  ts: number
}

export function useRealtime(branchId: string | null, onEvent: (e: RealtimeEvent) => void) {
  const [connected, setConnected] = useState(false)
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!branchId) return
    const token = getSessionToken()
    if (!token) return

    const socket: Socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: { token },
    })

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))
    socket.on('event', (e: RealtimeEvent) => onEventRef.current(e))

    return () => {
      socket.disconnect()
    }
  }, [branchId])

  return { connected }
}
