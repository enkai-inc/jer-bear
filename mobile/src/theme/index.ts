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
  border: '#C4A882',         // Visible brown border
  shadow: 'rgba(30, 15, 5, 0.15)',
};

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
    fontWeight: '700' as const,
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
