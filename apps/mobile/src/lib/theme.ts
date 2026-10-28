import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F6FA',
  card: '#FFFFFF',
  text: '#0B1220',
  muted: '#5B667A',
  border: '#E1E6EF',
  primary: '#2563EB',
  onPrimary: '#FFFFFF',
  danger: '#DC2626',
  success: '#15803D',
  chip: '#E8EEFB',
  bubbleIn: '#FFFFFF',
  bubbleOut: '#DCE8FF',
};

const dark: typeof light = {
  bg: '#0B1220',
  card: '#131C2E',
  text: '#F1F5FB',
  muted: '#93A0B8',
  border: '#22304A',
  primary: '#5B8DEF',
  onPrimary: '#0B1220',
  danger: '#F87171',
  success: '#4ADE80',
  chip: '#1B2A47',
  bubbleIn: '#1A2438',
  bubbleOut: '#223A66',
};

export type Palette = typeof light;
export const usePalette = (): Palette => (useColorScheme() === 'dark' ? dark : light);
