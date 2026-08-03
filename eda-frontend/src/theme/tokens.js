// Design tokens for the eSim Cloud interface.
//
// Every colour, radius, shadow and spacing value used by the application is
// defined here. Components must read from the MUI theme rather than reaching
// for these constants directly, so that a future palette swap stays local.

export const color = {
  // Surfaces
  canvas: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  surfaceSunken: '#f8fafc',

  // Lines
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  // Brand
  accent: '#2563eb',
  accentHover: '#1d4ed8',
  accentSubtle: '#eff6ff',
  accentBorder: '#bfdbfe',

  // Text
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textTertiary: '#94a3b8',
  textInverse: '#ffffff',

  // Status
  success: '#059669',
  successSubtle: '#ecfdf5',
  warning: '#d97706',
  warningSubtle: '#fffbeb',
  danger: '#dc2626',
  dangerSubtle: '#fef2f2',
  info: '#0891b2',
  infoSubtle: '#ecfeff'
}

export const font = {
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace'
}

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  pill: 999
}

// Restrained elevation. Enterprise surfaces sit close to the page.
export const shadow = {
  xs: '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
  sm: '0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
  md: '0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
  lg: '0 12px 32px -8px rgba(15, 23, 42, 0.14)'
}

// 8px base. MUI's theme.spacing(n) resolves to n * 8.
export const space = 8

export const layout = {
  navHeight: 60,
  contentMaxWidth: 1180
}
