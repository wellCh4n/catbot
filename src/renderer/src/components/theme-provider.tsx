import { useEffect, useState, ReactNode, JSX } from 'react'
import { ThemeContext, Theme } from './theme-context'

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setTheme] = useState<Theme>('system')

  // Load theme from config on mount
  useEffect(() => {
    const loadTheme = async (): Promise<void> => {
      try {
        const content = await window.api.readConfigFile('catbot.json')
        const parsed = JSON.parse(content)
        if (parsed.system?.theme) {
          setTheme(parsed.system.theme as Theme)
        }
      } catch (error) {
        console.error('Failed to load theme:', error)
      }
    }
    loadTheme()
  }, [])

  // Apply theme class
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (): void => {
      const root = window.document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(mediaQuery.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: (t) => setTheme(t) }}>
      {children}
    </ThemeContext.Provider>
  )
}
