export const colors = {
  // Bear-themed warm palette
  primary: '#8B5E3C',        // Teddy bear brown
  primaryLight: '#C4956A',   // Light tan
  primaryDark: '#5C3A1E',    // Dark brown
  accent: '#F4A261',         // Warm amber/honey
  accentLight: '#FDEBD0',    // Cream
  background: '#FFF8F0',     // Warm white
  surface: '#FFFFFF',
  surfaceWarm: '#FFF3E6',    // Warm surface
  text: '#3C2415',           // Dark brown text
  textSecondary: '#8B7355',  // Muted brown
  textLight: '#FFFFFF',
  success: '#6DBE6D',        // Soft green
  warning: '#F4A261',        // Amber
  danger: '#E76F51',         // Warm red
  paused: '#B0A090',         // Muted for paused items
  border: '#E8D5C4',         // Light brown border
  shadow: 'rgba(92, 58, 30, 0.1)',
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
