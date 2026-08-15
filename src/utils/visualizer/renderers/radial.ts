import { RenderContext, TAU, hexToRgba } from './shared';

export interface RadialGeometry {
  centerX: number;
  centerY: number;
  baseRadius: number;
  dotCount: number;
  // precomputed angles for the dotted ring
  dotAngles: Float32Array;
  // radial bars occupy a 200° arc at the bottom
  barCount: number;
  barStartAngle: number;
  barAngleSpan: number;
  barMaxLen: number;
}

export function createRadialGeometry(
  width: number,
  height: number,
  bandCount: number
): RadialGeometry {
  const centerX = width / 2;
  const centerY = height / 2 + 40;
  const baseRadius = Math.min(width, height) * 0.28;
  const dotCount = 96;
  const dotAngles = new Float32Array(dotCount);
  for (let i = 0; i < dotCount; i++) dotAngles[i] = (i / dotCount) * TAU;

  return {
    centerX,
    centerY,
    baseRadius,
    dotCount,
    dotAngles,
    barCount: bandCount,
    barStartAngle: Math.PI * 1.12, // ~202°
    barAngleSpan: Math.PI * 0.76, // ~137° across the bottom
    barMaxLen: Math.min(width, height) * 0.2,
  };
}

function lerpAngle(a0: number, a1: number, t: number): number {
  return a0 + (a1 - a0) * t;
}

// Dotted glowing ring + rounded radial bars on a lower arc, with a gentle
// beat-driven radius pulse.
export function renderRadial(ctx: CanvasRenderingContext2D, g: RadialGeometry, rc: RenderContext): void {
  const { frame, theme, time } = rc;
  const c = theme.colors;
  const beat = frame.beat;
  const pulse = 1 + beat * 0.03 + Math.sin(time * 1.2) * 0.006;
  const cx = g.centerX;
  const cy = g.centerY;
  const ringR = g.baseRadius * pulse;
  const n = Math.min(frame.bands.length, g.barCount);

  ctx.save();

  // --- Radial bars (arc) ---
  const grad = ctx.createLinearGradient(0, cy - ringR - g.barMaxLen, 0, cy + ringR + g.barMaxLen);
  grad.addColorStop(0, c.gradient[0]);
  grad.addColorStop(0.5, c.gradient[1]);
  grad.addColorStop(1, c.gradient[2]);
  ctx.shadowColor = c.primaryGlow;
  ctx.shadowBlur = 18;
  ctx.lineCap = 'round';

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = lerpAngle(g.barStartAngle, g.barStartAngle + g.barAngleSpan, t);
    const len = Math.max(6, frame.bands[i] * g.barMaxLen);
    const innerR = ringR * 0.92;
    const x0 = cx + Math.cos(angle) * innerR;
    const y0 = cy + Math.sin(angle) * innerR;
    const x1 = cx + Math.cos(angle) * (innerR + len);
    const y1 = cy + Math.sin(angle) * (innerR + len);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // --- Dotted ring ---
  const dotBaseR = ringR;
  for (let i = 0; i < g.dotCount; i++) {
    const angle = g.dotAngles[i];
    // map dot index onto the same bands used by the bars
    const bandIdx = Math.floor((i / g.dotCount) * n);
    const amp = frame.bands[bandIdx] ?? 0;
    const r = dotBaseR + amp * 16;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const dotR = 3 + amp * 4 + beat * 1.5;
    ctx.fillStyle = hexToRgba(c.accent, 0.35 + amp * 0.6);
    ctx.shadowColor = c.primaryGlow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}
