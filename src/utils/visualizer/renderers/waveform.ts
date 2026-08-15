import { RenderContext, hexToRgba, getVerticalGradient } from './shared';

// True time-domain waveform from getByteTimeDomainData (0..255, 128 = center).
// Drawn as a smooth quadratic-curve line with layered glow, a bright core, and
// a faint center axis. Amplitude is normalized to avg volume so quiet passages
// stay visible and loud passages don't clip.
export function renderWaveform(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
  const { waveform, beat, avgVolume } = rc.frame;
  const c = rc.theme.colors;
  const midY = rc.height / 2 + 60;
  // amplitude 80..150, scaled up slightly by overall volume + beat
  const base = 78 + avgVolume * 45;
  const amplitude = base * (1 + beat * 0.08);
  const slice = rc.width / waveform.length;
  const grad = getVerticalGradient(ctx, rc.theme, 0, midY - amplitude, midY + amplitude);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Build path once
  const path = new Path2D();
  for (let i = 0; i < waveform.length; i++) {
    const y = midY + ((waveform[i] - 128) / 128) * amplitude;
    const x = i * slice;
    if (i === 0) path.moveTo(x, y);
    else if (i % 2 === 0) {
      // midpoint quadratic smoothing
      const prevY = midY + ((waveform[i - 1] - 128) / 128) * amplitude;
      const prevX = (i - 1) * slice;
      path.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2);
    }
  }

  // Glow pass
  ctx.strokeStyle = c.primaryGlow;
  ctx.shadowColor = c.primaryGlow;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 5;
  ctx.stroke(path);

  // Bright core pass
  ctx.strokeStyle = grad;
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.stroke(path);

  // Center axis
  ctx.strokeStyle = hexToRgba(c.accent, 0.16);
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(rc.width, midY);
  ctx.stroke();

  ctx.restore();
}
