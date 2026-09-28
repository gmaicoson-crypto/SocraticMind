/**
 * Reads a semantic color from the active theme without duplicating its value
 * in JavaScript. This is needed by canvas and third-party rendering APIs that
 * cannot consume CSS custom properties directly.
 */
export function themeColor(variable: string, fallback = '') {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback
}

export function themeColors(variables: string[]) {
  return variables.map((variable) => themeColor(variable))
}
