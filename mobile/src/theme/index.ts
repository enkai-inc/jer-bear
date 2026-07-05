export const colors = {
  // Bear-themed warm palette — WCAG AA contrast ratios
  primary: '#4A2510',        // Rich dark brown (11:1 on white)
  primaryLight: '#7D4520',   // Medium brown
  primaryDark: '#2C1508',    // Near-black brown
  accent: '#9A5500',         // Dark amber (5.8:1 on white)
  accentLight: '#FDEBD0',    // Cream (backgrounds only)
  background: '#FFFBF5',     // Warm white
  surface: '#FFFFFF',
  surfaceWarm: '#FFF3E6',    // Warm surface
  text: '#1A0E06',           // Near-black brown (16:1 on white)
  textSecondary: '#5C3D28',  // Medium-dark brown (7.2:1 on white)
  textLight: '#FFFFFF',
  success: '#1B7A1B',        // Dark green (5.3:1 on white)
  warning: '#B05A00',        // Deep amber
  danger: '#C0392B',         // Strong red (5.6:1 on white)
  paused: '#7A6B5D',         // Muted brown (4.8:1 on white)
  border: '#C4A882',         // Decorative card borders only (2.27:1)
  borderStrong: '#8A6B45',   // Interactive control borders (>=3:1 per WCAG 1.4.11)
  overlay: 'rgba(26, 14, 6, 0.5)', // Modal scrim
  dangerTint: '#FAEBE4',     // Error banner background
  shadow: 'rgba(30, 15, 5, 0.15)',
};

/** Convert a #RRGGBB hex color to an rgba() string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const typography = {
  title: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: colors.text,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: colors.text,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
};
