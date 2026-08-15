import { RenderContext, hexToRgba } from './shared';

// True time-domain waveform from getByteTimeDomainData (0..255, 128 = center).
export function renderWaveform(ctx: CanvasRenderingContext2D, rc: RenderContext): void {
  const { waveform, beat } = rc.frame;
  const c = rc.theme.colors;
  const midY = rc.height / 2 + 60;
  const amplitude = 130 * (1 + beat * 0.15);
  const slice = rc.width / waveform.length;

  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Glow pass
  ctx.strokeStyle = c.primaryGlow;
  ctx.shadowColor = c.primaryGlow;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  for (let i = 0; i < waveform.length; i++) {
    const y = midY + ((waveform[i] - 128) / 128) * amplitude;
    const x = i * slice;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Bright core pass
  const grad = ctx.createLinearGradient(0, 0, rc.width, 0);
  grad.addColorStop(0, c.gradient[0]);
  grad.addColorStop(0.5, c.gradient[1]);
  grad.addColorStop(1, c.gradient[2]);
  ctx.strokeStyle = grad;
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Center axis
  ctx.strokeStyle = hexToRgba(c.accent, 0.18);
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(rc.width, midY);
  ctx.stroke();

  ctx.restore();
}
