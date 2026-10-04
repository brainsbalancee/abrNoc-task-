'use client'
import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, ChefHat, UtensilsCrossed, Flame, Receipt } from 'lucide-react'

const DEMO_ACCOUNTS = [
  { email: 'manager@shandiz.test', role: 'MANAGER', name: 'Ali Rezaei', desc: 'Full access · both branches', icon: UtensilsCrossed },
  { email: 'waiter1@shandiz.test', role: 'WAITER', name: 'Mohammad', desc: 'Valiasr branch · take orders', icon: Receipt },
  { email: 'kitchen@shandiz.test', role: 'KITCHEN', name: 'Reza (Chef)', desc: 'Valiasr · cook display', icon: Flame },
  { email: 'cashier@shandiz.test', role: 'CASHIER', name: 'Fatemeh', desc: 'Valiasr · close checks', icon: Receipt },
  { email: 'manager@saffron.test', role: 'MANAGER', name: 'Hossein', desc: 'Second tenant (isolation test)', icon: UtensilsCrossed },
]

// Inner component that uses useSearchParams — must be wrapped in Suspense
// for static prerendering (Next.js 16 requirement).
function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('Invalid credentials. Try a demo account below — all passwords are "demo1234".')
      return
    }
    router.push(params.get('callbackUrl') || '/')
    router.refresh()
  }

  function quick(em: string) {
    setEmail(em)
    setPassword('demo1234')
    setTimeout(() => submit(), 50)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_1.1fr] gap-6 items-stretch">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col justify-between rounded-2xl bg-primary text-primary-foreground p-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, currentColor 0%, transparent 40%), radial-gradient(circle at 70% 80%, currentColor 0%, transparent 40%)' }} />
          <div className="relative">
            <div className="flex items-center gap-2.5 mb-8">
              <div className="h-10 w-10 rounded-xl bg-primary-foreground/15 backdrop-blur flex items-center justify-center">
                <ChefHat className="h-5 w-5" />
              </div>
              <span className="font-semibold text-xl tracking-tight">Meshkī</span>
            </div>
            <h1 className="text-3xl font-bold leading-tight mb-3">
              The order lifecycle,<br/>finished and defensible.
            </h1>
            <p className="text-primary-foreground/80 text-sm leading-relaxed max-w-sm">
              Waiter, kitchen, cashier — real-time, multi-tenant, role-gated.
              Built for Iranian restaurants. One workflow, every shift.
            </p>
          </div>
          <div className="relative space-y-2 mt-8">
            {[
              { label: 'Real-time kitchen display', icon: Flame },
              { label: 'Optimistic concurrency on every order', icon: Receipt },
              { label: 'AI shift summary with graceful fallback', icon: ChefHat },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 text-sm text-primary-foreground/90">
                <div className="h-7 w-7 rounded-md bg-primary-foreground/10 flex items-center justify-center">
                  <f.icon className="h-3.5 w-3.5" />
                </div>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        {/* Login form */}
        <Card className="border-border/60 shadow-sm self-center w-full">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                <ChefHat className="h-5 w-5" />
              </div>
              <span className="font-semibold text-lg">Meshkī</span>
            </div>
            <div>
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription className="mt-1">
                Restaurant platform for Iranian cafés &amp; restaurants.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Staff email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@restaurant.test"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Sign in
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Demo password for all accounts: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">demo1234</code>
              </p>
            </form>

            <div className="mt-6 pt-5 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wide">Demo accounts — one click</p>
              <div className="space-y-1.5">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    onClick={() => quick(a.email)}
                    disabled={loading}
                    className="w-full text-left p-2.5 rounded-lg border border-border/60 hover:border-primary/40 hover:bg-accent/50 transition disabled:opacity-50 group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition">
                        <a.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.desc}</div>
                      </div>
                      <span className="text-[9px] font-mono uppercase tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                        {a.role}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <LoginForm />
    </Suspense>
  )
}
