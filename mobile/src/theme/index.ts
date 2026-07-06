export const colors = {
  // "Meadow" palette — calm teal primary with a honey accent nodding to the
  // bear mascot. All pairings below are WCAG AA validated (see repo README);
  // text tokens >=4.5:1 on background/surface/surfaceTint, borderStrong and
  // interactive fills >=3:1 per WCAG 1.4.11.
  primary: '#0F766E',        // Deep teal — buttons, active tab, stat numbers
  primaryLight: '#14B8A6',   // Bright teal (decorative only, never text)
  primaryDark: '#134E4A',    // Near-black teal
  accent: '#92400E',         // Honey amber — time accents, snooze, bear notes
  accentLight: '#FEF3C7',    // Soft honey (backgrounds only)
  background: '#F6FAF8',     // Mint-tinted white
  surface: '#FFFFFF',
  surfaceTint: '#E9F3EF',    // Soft mint surface (paused cards, icon chips)
  text: '#152420',           // Near-black green
  textSecondary: '#4E635B',  // Muted green-grey
  textLight: '#FFFFFF',
  success: '#166534',        // Dark green
  warning: '#A16207',        // Deep amber (dev log warnings)
  danger: '#B91C1C',         // Strong red
  paused: '#566B61',         // Muted sage — paused text + badge fill
  border: '#DCE7E1',         // Decorative card borders only
  borderStrong: '#6D8A7F',   // Interactive control borders (>=3:1 per WCAG 1.4.11)
  overlay: 'rgba(13, 27, 22, 0.5)', // Modal scrim
  dangerTint: '#FDE8E8',     // Error banner background
  shadow: 'rgba(15, 55, 45, 0.14)',
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
