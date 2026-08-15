import { FrameData } from '../audioAnalyzer';
import { VisualizerTheme } from '../themes';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  frame: FrameData;
  theme: VisualizerTheme;
  time: number; // elapsed seconds
  duration: number;
}

// Deep glass background with a beat-reactive radial glow.
export function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, rc: RenderContext): void {
  const c = rc.theme.colors;
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2 + 40;
  const pulse = 220 + rc.frame.avgVolume * 160 + rc.frame.beat * 60;

  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, pulse);
  glow.addColorStop(0, c.primaryGlow.replace('0.9', '0.28'));
  glow.addColorStop(0.6, c.secondaryGlow.replace('0.5', '0.12'));
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

export const TAU = Math.PI * 2;

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Vertical gradient from theme stops, cached per theme+height.
export function getVerticalGradient(
  ctx: CanvasRenderingContext2D,
  theme: VisualizerTheme,
  x: number,
  y0: number,
  y1: number
): CanvasGradient {
  const g = ctx.createLinearGradient(x, y0, x, y1);
  const [c0, c1, c2] = theme.colors.gradient;
  g.addColorStop(0, c0);
  g.addColorStop(0.5, c1);
  g.addColorStop(1, c2);
  return g;
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (h <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export interface HudGeometry {
  titleY: number;
  subtitleY: number;
  timeY: number;
  progressY: number;
  progressW: number;
}

export function createHudGeometry(width: number): HudGeometry {
  return {
    titleY: 110,
    subtitleY: 152,
    timeY: 622,
    progressY: 668,
    progressW: Math.min(640, width * 0.5),
  };
}

// Title + subtitle + elapsed time + progress bar, shared by every style.
export function drawHud(ctx: CanvasRenderingContext2D, hud: HudGeometry, rc: RenderContext, title: string): void {
  const c = rc.theme.colors;
  ctx.save();
  ctx.textAlign = 'center';

  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = c.title;
  ctx.shadowColor = c.primaryGlow;
  ctx.shadowBlur = 18;
  ctx.fillText(title, rc.width / 2, hud.titleY);

  ctx.font = '500 17px sans-serif';
  ctx.fillStyle = c.subtitle;
  ctx.shadowBlur = 0;
  ctx.fillText('AUDIO SPECTRUM VISUALIZER', rc.width / 2, hud.subtitleY);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  ctx.font = '600 16px monospace';
  ctx.fillStyle = c.subtitle;
  ctx.fillText(`${fmt(rc.time)} / ${fmt(rc.duration)}`, rc.width / 2, hud.timeY);

  const trackX = (rc.width - hud.progressW) / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundedRect(ctx, trackX, hud.progressY, hud.progressW, 8, 4);
  ctx.fill();

  const pct = Math.max(0, Math.min(1, rc.time / Math.max(0.001, rc.duration)));
  const fillW = hud.progressW * pct;
  if (fillW > 0) {
    ctx.shadowColor = c.primaryGlow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = c.accent;
    roundedRect(ctx, trackX, hud.progressY, fillW, 8, 4);
    ctx.fill();
  }
  ctx.restore();
}
