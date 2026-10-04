'use client'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChefHat, Soup, Drumstick, Salad, Coffee, Cookie, Loader2, Search, X } from 'lucide-react'
import { api, fmtToman } from '@/lib/client'
import { useApp } from '../layout'
import { useState, useMemo } from 'react'

// Category icon mapping — gives the menu card a real restaurant feel.
const CATEGORY_ICON: Record<string, any> = {
  kebabs: Drumstick,
  'stews (khoresht)': Soup,
  'rice dishes (polo)': ChefHat,
  appetizers: Salad,
  drinks: Coffee,
  desserts: Cookie,
}
const STATION_TONE: Record<string, string> = {
  grill: 'bg-chart-5/10 text-chart-5 border-chart-5/20',
  kitchen: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
  cold: 'bg-chart-3/10 text-chart-3 border-chart-3/20',
  bar: 'bg-chart-4/10 text-chart-4 border-chart-4/20',
  main: 'bg-muted text-muted-foreground border-border',
}

interface MenuItem {
  id: string
  name: string
  nameFa: string | null
  price: number
  kitchenStation: string
}
interface MenuCategory {
  id: string
  name: string
  sortOrder: number
  items: MenuItem[]
}

export default function MenuPage() {
  const { } = useApp()
  const [query, setQuery] = useState('')

  const menu = useQuery({
    queryKey: ['menu'],
    queryFn: () => api<MenuCategory[]>('/api/menu').then((r) => r.data),
  })

  const filtered = useMemo(() => {
    if (!menu.data) return []
    if (!query.trim()) return menu.data
    const q = query.toLowerCase().trim()
    return menu.data
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            (it.nameFa ?? '').includes(q) ||
            it.kitchenStation.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0)
  }, [menu.data, query])

  const totalItems = menu.data?.reduce((s, c) => s + c.items.length, 0) ?? 0

  if (menu.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Menu header — like a printed menu card */}
      <div className="text-center pt-2 pb-4">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">
          <ChefHat className="h-3.5 w-3.5" />
          <span>Meshkī · Shandiz Garden</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Menu</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          {totalItems} dishes · prices in Toman · tax included
        </p>
      </div>

      {/* Search */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-3 bg-background/80 backdrop-blur-lg border-b border-border/40">
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes, stations, or Persian names…"
            className="w-full pl-9 pr-9 py-2 text-sm bg-card border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {query ? `No dishes match “${query}”.` : 'No menu items.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {filtered.map((cat) => {
            const Icon = CATEGORY_ICON[cat.name.toLowerCase()] ?? ChefHat
            return (
              <section key={cat.id}>
                {/* Category header — menu-card style */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight">{cat.name}</h2>
                    <p className="text-xs text-muted-foreground">{cat.items.length} items</p>
                  </div>
                </div>
                <Separator className="mb-4 bg-border/60" />

                {/* Items — two-column on desktop, single on mobile */}
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {cat.items.map((it) => {
                    const tone = STATION_TONE[it.kitchenStation] ?? STATION_TONE.main
                    return (
                      <Card
                        key={it.id}
                        className="p-3.5 hover:border-primary/30 hover:shadow-sm transition group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <h3 className="font-medium text-sm leading-tight">{it.name}</h3>
                              {it.nameFa && (
                                <span className="text-xs text-muted-foreground/80 font-medium" dir="rtl" lang="fa">
                                  {it.nameFa}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${tone}`}>
                                {it.kitchenStation}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono text-sm font-semibold text-primary">
                              {fmtToman(it.price)}
                            </div>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <div className="text-center py-6 text-xs text-muted-foreground/70">
        Menu is tenant-scoped — only your restaurant's dishes appear here.
      </div>
    </div>
  )
}
