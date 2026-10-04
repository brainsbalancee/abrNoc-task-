'use client'
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  )
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <NextAuthSessionProvider>
        <QueryClientProvider client={qc}>
          {children}
          <SonnerToaster richColors position="top-center" theme="system" />
        </QueryClientProvider>
      </NextAuthSessionProvider>
    </ThemeProvider>
  )
}
