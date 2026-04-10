/** Shared accent palette for App bootstrap and Settings. */
export const ACCENT_COLOR_MAP = {
  blue: { color: '#3b82f6', hover: '#2563eb', light: 'rgba(59, 130, 246, 0.1)' },
  indigo: { color: '#6366f1', hover: '#4f46e5', light: 'rgba(99, 102, 241, 0.1)' },
  purple: { color: '#8b5cf6', hover: '#7c3aed', light: 'rgba(139, 92, 246, 0.1)' },
  violet: { color: '#a855f7', hover: '#9333ea', light: 'rgba(168, 85, 247, 0.1)' },
  fuchsia: { color: '#d946ef', hover: '#c026d3', light: 'rgba(217, 70, 239, 0.1)' },
  pink: { color: '#ec4899', hover: '#db2777', light: 'rgba(236, 72, 153, 0.1)' },
  rose: { color: '#f43f5e', hover: '#e11d48', light: 'rgba(244, 63, 94, 0.1)' },
  red: { color: '#ef4444', hover: '#dc2626', light: 'rgba(239, 68, 68, 0.1)' },
  orange: { color: '#f97316', hover: '#ea580c', light: 'rgba(249, 115, 22, 0.1)' },
  amber: { color: '#f59e0b', hover: '#d97706', light: 'rgba(245, 158, 11, 0.1)' },
  yellow: { color: '#eab308', hover: '#ca8a04', light: 'rgba(234, 179, 8, 0.1)' },
  lime: { color: '#84cc16', hover: '#65a30d', light: 'rgba(132, 204, 22, 0.1)' },
  green: { color: '#22c55e', hover: '#16a34a', light: 'rgba(34, 197, 94, 0.1)' },
  emerald: { color: '#10b981', hover: '#059669', light: 'rgba(16, 185, 129, 0.1)' },
  teal: { color: '#14b8a6', hover: '#0d9488', light: 'rgba(20, 184, 166, 0.1)' },
  cyan: { color: '#06b6d4', hover: '#0891b2', light: 'rgba(6, 182, 212, 0.1)' },
  sky: { color: '#0ea5e9', hover: '#0284c7', light: 'rgba(14, 165, 233, 0.1)' },
} as const;

export type AccentColorKey = keyof typeof ACCENT_COLOR_MAP;

export function applyAccentColorVars(accentKey: string): void {
  const colorConfig =
    ACCENT_COLOR_MAP[accentKey as AccentColorKey] ?? ACCENT_COLOR_MAP.blue;
  const root = document.documentElement;
  root.style.setProperty('--accent-color', colorConfig.color);
  root.style.setProperty('--accent-hover', colorConfig.hover);
  root.style.setProperty('--accent-light', colorConfig.light);
}
