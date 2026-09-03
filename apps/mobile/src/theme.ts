// Same neutral (black/white) design language validated in the Klyvero Mobile
// design canvas: --p ("brand") is the one token that flips between the ink
// (light) and paper (dark) default, or a tenant's own white-label color when
// one is set. Everything else (surfaces, text, borders) is pure grayscale.
export type ThemeMode = 'light' | 'dark';

export type Theme = {
  mode: ThemeMode;
  brand: string;
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  danger: string;
  dangerBg: string;
  overlay: string;
  tint: (opacity: number) => string;
};

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

export function buildTheme(mode: ThemeMode, brandOverride?: string | null): Theme {
  const dark = mode === 'dark';
  const brand = brandOverride || (dark ? '#f2f3f5' : '#101114');
  const { r, g, b } = hexToRgb(brand);
  return {
    mode,
    brand,
    bg: dark ? '#101114' : '#f6f6f7',
    card: dark ? '#17191c' : '#ffffff',
    text: dark ? '#f2f3f5' : '#15171b',
    muted: dark ? '#9096a1' : '#84898f',
    border: dark ? '#2a2d33' : '#e5e6ea',
    danger: '#b42318',
    dangerBg: dark ? '#3a1512' : '#fff0ef',
    overlay: dark ? 'rgba(0,0,0,.6)' : 'rgba(16,17,20,.4)',
    tint: (opacity: number) => `rgba(${r},${g},${b},${opacity})`,
  };
}

export const radius = { sm: 9, md: 11, lg: 16, xl: 24, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22 };
