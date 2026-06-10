export const THEME_STORAGE_KEY = 'esim_theme'
const LEGACY_STORAGE_KEY = 'esim_dark_mode'

export function getStoredDarkMode () {
  return sessionStorage.getItem(THEME_STORAGE_KEY) === 'dark'
}

export function setStoredDarkMode (darkMode) {
  sessionStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light')
}

export function applyDocumentTheme (darkMode) {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
}

export function getInitialDarkMode () {
  // Clear old persistent keys; dark mode is session-only via the toggle button.
  localStorage.removeItem(LEGACY_STORAGE_KEY)
  localStorage.removeItem(THEME_STORAGE_KEY)
  return sessionStorage.getItem(THEME_STORAGE_KEY) === 'dark'
}
