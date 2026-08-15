import { RenderContext, getVerticalGradient, roundedRect } from './shared';

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
  const sidePad = 60;
  const gap = Math.max(1, Math.floor(width * 0.003));
  const barWidth = Math.max(2, (width - sidePad * 2) / bandCount - gap);
  return {
    startX: sidePad,
    barWidth,
    gap,
    baselineY: height - 190,
    maxHeight: height - 260,
  };
}

// Rounded vertical bars, gradient-filled, with a glowing peak cap per band.
export function renderBars(ctx: CanvasRenderingContext2D, g: BarsGeometry, rc: RenderContext): void {
  const { bands, peaks } = rc.frame;
  const n = Math.min(bands.length, rc.frame.bands.length);
  const grad = getVerticalGradient(ctx, rc.theme, 0, g.baselineY - g.maxHeight, g.baselineY);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.shadowColor = rc.theme.colors.primaryGlow;
  ctx.shadowBlur = 14;

  for (let i = 0; i < n; i++) {
    const h = Math.max(3, bands[i] * g.maxHeight);
    const x = g.startX + i * (g.barWidth + g.gap);
    const y = g.baselineY - h;
    roundedRect(ctx, x, y, g.barWidth, h, g.barWidth / 2);
    ctx.fill();
  }

  // Peak caps
  ctx.fillStyle = rc.theme.colors.title;
  ctx.shadowBlur = 18;
  for (let i = 0; i < n; i++) {
    const peakH = peaks[i] * g.maxHeight;
    if (peakH < 2) continue;
    const x = g.startX + i * (g.barWidth + g.gap);
    const capH = Math.min(6, Math.max(3, g.barWidth * 0.5));
    roundedRect(ctx, x - 1, g.baselineY - peakH - capH, g.barWidth + 2, capH, 2);
    ctx.fill();
  }
  ctx.restore();
}
