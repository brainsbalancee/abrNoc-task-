'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, ChefHat } from 'lucide-react'

const DEMO_ACCOUNTS = [
  { email: 'manager@shandiz.test', role: 'MANAGER', name: 'Ali Rezaei', desc: 'Full access · both branches' },
  { email: 'waiter1@shandiz.test', role: 'WAITER', name: 'Mohammad', desc: 'Valiasr branch · take orders' },
  { email: 'kitchen@shandiz.test', role: 'KITCHEN', name: 'Reza (Chef)', desc: 'Valiasr · cook display' },
  { email: 'cashier@shandiz.test', role: 'CASHIER', name: 'Fatemeh', desc: 'Valiasr · close checks' },
  { email: 'manager@saffron.test', role: 'MANAGER', name: 'Hossein', desc: 'Second tenant (isolation test)' },
]

export default function LoginPage() {
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
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 to-amber-50 p-4">
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl w-full">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-lg bg-stone-900 text-amber-50 flex items-center justify-center">
                <ChefHat className="h-5 w-5" />
              </div>
              <span className="font-semibold text-lg">Meshkī</span>
            </div>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Restaurant platform for Iranian cafés &amp; restaurants.
            </CardDescription>
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full bg-stone-900 hover:bg-stone-800" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Sign in
              </Button>
              <p className="text-xs text-stone-500 text-center">
                Demo password for all accounts: <code className="bg-stone-100 px-1 py-0.5 rounded">demo1234</code>
              </p>
            </form>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-base">Demo accounts</CardTitle>
            <CardDescription>One click to sign in as each role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => quick(a.email)}
                disabled={loading}
                className="w-full text-left p-3 rounded-md border border-amber-200 bg-white hover:bg-amber-100/60 transition disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-stone-500">{a.desc}</div>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wide bg-stone-900 text-amber-50 px-1.5 py-0.5 rounded">
                    {a.role}
                  </span>
                </div>
                <div className="text-[10px] text-stone-400 mt-1">{a.email}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
