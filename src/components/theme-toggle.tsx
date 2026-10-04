'use client'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Defer to next tick to satisfy the react-hooks/set-state-in-effect rule
    // while still marking the component mounted after hydration.
    setMounted(true)
  }, [])

  function toggle() {
    const current = resolvedTheme ?? theme
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
      title={mounted ? (resolvedTheme === 'dark' ? 'Switch to light' : 'Switch to dark') : 'Toggle theme'}
      aria-label="Toggle color theme"
    >
      {mounted ? (
        resolvedTheme === 'dark' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )
      ) : (
        <div className="h-4 w-4" />
      )}
    </Button>
  )
}
