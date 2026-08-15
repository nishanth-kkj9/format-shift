import { RenderContext, getVerticalGradient, hexToRgba, roundedRect } from './shared';

export interface BarsGeometry {
  startX: number;
  barWidth: number;
  gap: number;
  baselineY: number;
  maxHeight: number;
}

export function createBarsGeometry(
  width: number,
  height: number,
  bandCount: number
): BarsGeometry {
  const sidePad = 80;
  const gap = Math.max(2, Math.round(width * 0.004));
  const barWidth = Math.max(4, Math.floor((width - sidePad * 2) / bandCount - gap));
  return {
    startX: sidePad,
    barWidth,
    gap,
    baselineY: height - 190,
    maxHeight: height - 280,
  };
}

// Rounded vertical bars, gradient-filled, with a glowing peak cap and a faint
// reflection. Heights are driven by the analyzer's smoothed bands (stable).
export function renderBars(ctx: CanvasRenderingContext2D, g: BarsGeometry, rc: RenderContext): void {
  const { bands, peaks, beat } = rc.frame;
  const n = Math.min(bands.length, g.maxHeight > 0 ? bands.length : 0);
  const c = rc.theme.colors;
  const grad = getVerticalGradient(ctx, rc.theme, 0, g.baselineY - g.maxHeight, g.baselineY);
  const transient = 1 + beat * 0.12; // small transient boost on beat

  ctx.save();

  // Reflection pass (faint, only if the visualizer has room)
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = c.accent;
  for (let i = 0; i < n; i++) {
    const h = Math.max(3, bands[i] * g.maxHeight * transient);
    const x = g.startX + i * (g.barWidth + g.gap);
    roundedRect(ctx, x, g.baselineY + 4, g.barWidth, Math.max(2, h * 0.22), g.barWidth / 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Main bars
  ctx.fillStyle = grad;
  ctx.shadowColor = c.primaryGlow;
  ctx.shadowBlur = 10;
  for (let i = 0; i < n; i++) {
    const h = Math.max(3, bands[i] * g.maxHeight * transient);
    const x = g.startX + i * (g.barWidth + g.gap);
    const y = g.baselineY - h;
    roundedRect(ctx, x, y, g.barWidth, h, g.barWidth / 2);
    ctx.fill();
  }

  // Peak caps (glowing)
  ctx.shadowBlur = 14;
  for (let i = 0; i < n; i++) {
    const peakH = peaks[i] * g.maxHeight;
    if (peakH < 2) continue;
    const x = g.startX + i * (g.barWidth + g.gap);
    const capH = Math.min(7, Math.max(3, g.barWidth * 0.5));
    ctx.fillStyle = hexToRgba(c.accent, 0.9);
    roundedRect(ctx, x - 1.5, g.baselineY - peakH - capH, g.barWidth + 3, capH, 2.5);
    ctx.fill();
  }

  ctx.restore();
}
