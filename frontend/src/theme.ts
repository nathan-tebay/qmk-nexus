export const THEME_STORAGE_KEY = 'qmk-nexus-theme'

export const themes = [
  { id: 'nexus', label: 'Nexus Gold' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'rose', label: 'Rose' },
  { id: 'mono', label: 'Mono' },
] as const

export type ThemeId = typeof themes[number]['id']

export const defaultTheme: ThemeId = 'nexus'

export function isThemeId(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value)
}

export function getStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeId(stored) ? stored : defaultTheme
  } catch {
    return defaultTheme
  }
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

export function storeTheme(theme: ThemeId) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The theme still applies for this session when storage is unavailable.
  }
}
