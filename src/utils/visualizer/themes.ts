import { SpectrumTheme } from '../../types';

export interface ThemeColors {
  // gradient stops (hex), evenly spaced 0..1 — 4-5 stops for rich angular rings
  gradient: string[];
  // glow tints (used for shadows / radial glow)
  primaryGlow: string;
  secondaryGlow: string;
  // background
  background: string;
  // text
  title: string;
  subtitle: string;
  // accent for dots / ring / progress
  accent: string;
}

export interface VisualizerTheme {
  id: SpectrumTheme;
  label: string;
  colors: ThemeColors;
}

export const VISUALIZER_THEMES: Record<SpectrumTheme, VisualizerTheme> = {
  'neon-lime': {
    id: 'neon-lime',
    label: '🟢 Neon Lime Reactor',
    colors: {
      gradient: ['#e9ff00', '#a5ff3c', '#3fe06a', '#00d6b8', '#00a8ff'],
      primaryGlow: 'rgba(157, 255, 0, 0.9)',
      secondaryGlow: 'rgba(0, 200, 255, 0.5)',
      background: '#05080a',
      title: '#eaffdd',
      subtitle: '#8fcaa8',
      accent: '#b8ff3c',
    },
  },
  'indigo-violet': {
    id: 'indigo-violet',
    label: '🔮 Indigo & Violet',
    colors: {
      gradient: ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899'],
      primaryGlow: 'rgba(139, 92, 246, 0.9)',
      secondaryGlow: 'rgba(236, 72, 153, 0.5)',
      background: '#0a0916',
      title: '#ece9ff',
      subtitle: '#a5a3e0',
      accent: '#a855f7',
    },
  },
  'cyan-emerald': {
    id: 'cyan-emerald',
    label: '💎 Cyan & Emerald',
    colors: {
      gradient: ['#06b6d4', '#10b981', '#34d399', '#a7f3d0'],
      primaryGlow: 'rgba(6, 182, 212, 0.9)',
      secondaryGlow: 'rgba(16, 185, 129, 0.5)',
      background: '#04100e',
      title: '#dcfff8',
      subtitle: '#8fc4b8',
      accent: '#2dd4bf',
    },
  },
  'sunset-fire': {
    id: 'sunset-fire',
    label: '🔥 Sunset Fire',
    colors: {
      gradient: ['#fbbf24', '#f97316', '#ef4444', '#f43f5e'],
      primaryGlow: 'rgba(249, 115, 22, 0.9)',
      secondaryGlow: 'rgba(244, 63, 94, 0.5)',
      background: '#0d0605',
      title: '#ffe9dc',
      subtitle: '#d6a08c',
      accent: '#fb7185',
    },
  },
  'matrix-green': {
    id: 'matrix-green',
    label: '⚡ Matrix Cyber Green',
    colors: {
      gradient: ['#22c55e', '#10b981', '#84cc16', '#86efac'],
      primaryGlow: 'rgba(34, 197, 94, 0.9)',
      secondaryGlow: 'rgba(132, 204, 22, 0.5)',
      background: '#030c05',
      title: '#dcffea',
      subtitle: '#8cc9a4',
      accent: '#4ade80',
    },
  },
  aurora: {
    id: 'aurora',
    label: '🌌 Aurora Borealis',
    colors: {
      gradient: ['#22d3ee', '#818cf8', '#c084fc', '#34d399'],
      primaryGlow: 'rgba(129, 140, 248, 0.9)',
      secondaryGlow: 'rgba(192, 132, 252, 0.5)',
      background: '#05060f',
      title: '#e8ecff',
      subtitle: '#9aa3d8',
      accent: '#a5b4fc',
    },
  },
};

export function getTheme(theme?: SpectrumTheme): VisualizerTheme {
  return VISUALIZER_THEMES[theme ?? 'neon-lime'] ?? VISUALIZER_THEMES['neon-lime'];
}
