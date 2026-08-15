import { RenderContext, TAU, sampleGradient, hexToRgba } from './shared';

export interface RadialConfig {
  dotCount: number;
  baseRadius: number; // ring radius in px
  // bars concentrated on an asymmetric arc (radians, canvas coords)
  arcStartAngle: number;
  arcSpan: number;
  barMaxLen: number;
  barMinLen: number;
  barWidth: number;
  dotMinR: number;
  dotMaxR: number;
  // subtle beat response (fractional radius expansion)
  beatPulse: number;
  // amplitude response per dot (px)
  dotAmpOffset: number;
}

export interface RadialGeometry {
  centerX: number;
  centerY: number;
  config: RadialConfig;
  // precomputed angles for the dotted ring
  dotAngles: Float32Array;
  // precomputed bar geometry (cos/sin cached — never recomputed per frame)
  barCos: Float32Array;
  barSin: Float32Array;
  bandCount: number;
  barWidth: number;
}

export const DEFAULT_RADIAL_CONFIG: RadialConfig = {
  dotCount: 88,
  baseRadius: 210,
  // Lower-left arc: ~120° centered on lower-left. Wide enough for 48 bars to
  // breathe without merging; narrow enough to keep the ring as the dominant shape.
  arcStartAngle: Math.PI * 0.5,
  arcSpan: Math.PI * 0.67,
  barMaxLen: 100,
  barMinLen: 6,
  barWidth: 8,
  dotMinR: 3,
  dotMaxR: 6.5,
  beatPulse: 0.025,
  dotAmpOffset: 12,
};

export function createRadialGeometry(
  width: number,
  height: number,
  bandCount: number,
  config: RadialConfig = DEFAULT_RADIAL_CONFIG
): RadialGeometry {
  // Center near the middle but raised slightly so the lower-left arc + bars
  // (radius 210 + up to 140px outward) never clip past the 720px frame bottom.
  const centerX = width / 2;
  const centerY = height / 2;
  const dotAngles = new Float32Array(config.dotCount);
  for (let i = 0; i < config.dotCount; i++) dotAngles[i] = (i / config.dotCount) * TAU;

  // Capsule width scaled to the arc so N bars fit without merging.
  const arcLen = config.baseRadius * config.arcSpan;
  const barWidth = Math.max(3, Math.min(8, Math.floor((arcLen / bandCount) * 0.55)));

  const barCos = new Float32Array(bandCount);
  const barSin = new Float32Array(bandCount);
  for (let i = 0; i < bandCount; i++) {
    const t = bandCount === 1 ? 0 : i / (bandCount - 1);
    const angle = config.arcStartAngle + t * config.arcSpan;
    barCos[i] = Math.cos(angle);
    barSin[i] = Math.sin(angle);
  }

  return { centerX, centerY, config, dotAngles, barCos, barSin, bandCount, barWidth };
}

// Layered neon stroke: soft outer glow -> medium glow -> sharp bright core.
function strokeBar(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  glowColor: string,
  width: number
): void {
  // outer soft glow
  ctx.strokeStyle = hexToRgba(glowColor, 0.18);
  ctx.lineWidth = width + 8;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  // medium glow
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // sharp bright core
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = Math.max(1, width * 0.3);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// Dotted glowing ring (angular multi-color gradient) + rounded neon bars on an
// asymmetric left/lower-left arc. Ring radius moves with OVERALL energy
// (avgVolume) rather than individual FFT bands, so the ring stays a stable,
// recognizable circle — bars carry the per-band audio movement.
export function renderRadial(ctx: CanvasRenderingContext2D, g: RadialGeometry, rc: RenderContext): void {
  const { frame, theme, time } = rc;
  const c = theme.colors;
  const cfg = g.config;
  const bands = frame.bands;
  const beat = frame.beat;
  const pulse = 1 + beat * cfg.beatPulse + Math.sin(time * 0.6) * 0.004;
  const ringR = cfg.baseRadius * pulse;
  const cx = g.centerX;
  const cy = g.centerY;
  const vol = frame.avgVolume;

  ctx.save();
  ctx.lineCap = 'round';

  // --- Radial bars (angular arc) ---
  const n = Math.min(bands.length, g.bandCount);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const cos = g.barCos[i];
    const sin = g.barSin[i];
    const amp = bands[i];
    const len = cfg.barMinLen + amp * (cfg.barMaxLen - cfg.barMinLen);
    const innerR = ringR * 0.96;
    const x0 = cx + cos * innerR;
    const y0 = cy + sin * innerR;
    const x1 = cx + cos * (innerR + len);
    const y1 = cy + sin * (innerR + len);
    const color = sampleGradient(c.gradient, t);
    strokeBar(ctx, x0, y0, x1, y1, color, c.primaryGlow, g.barWidth);
  }

  // --- Dotted ring with angular color gradient ---
  // Radius follows overall volume + beat uniformly (subtle); dot size has a
  // small per-dot variation for texture but never teleports with one band.
  const gradientStops = c.gradient;
  const ringOffset = vol * cfg.dotAmpOffset;
  const sizeRange = cfg.dotMaxR - cfg.dotMinR;
  for (let i = 0; i < cfg.dotCount; i++) {
    const angle = g.dotAngles[i];
    const wobble = 0.5 + 0.5 * Math.sin(i * 2.7 + time * 0.4);
    const r = ringR + ringOffset + wobble * 1.5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const dotR = cfg.dotMinR + vol * sizeRange * 0.6 + beat * 1.2;
    const color = sampleGradient(gradientStops, i / cfg.dotCount);

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = dotR * 1.8;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
