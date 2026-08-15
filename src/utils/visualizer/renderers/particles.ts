import { RenderContext, TAU, hexToRgba, sampleGradient } from './shared';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number; // stable per-particle drift phase
  seed: number; // stable per-particle randomness
  gradT: number; // stable position in the theme gradient
  alpha: number; // 0..1 base alpha
}

export interface ParticlesGeometry {
  particles: Particle[];
  count: number;
}

// Persistent particle pool — positions/velocities evolve each frame; never
// recreated per render tick. Audio only nudges velocity/brightness.
export function createParticlesGeometry(width: number, height: number): ParticlesGeometry {
  const count = 130;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push(spawn(width, height, Math.random(), Math.random() * 2 - 1));
  }
  return { particles, count };
}

function spawn(width: number, height: number, lifeSeed: number, side: number): Particle {
  return {
    x: Math.random() * width,
    y: height * (0.3 + 0.7 * lifeSeed),
    vx: side * (8 + Math.random() * 14),
    vy: 30 + Math.random() * 45,
    size: 1.6 + Math.random() * 2.8,
    phase: Math.random() * TAU,
    seed: Math.random(),
    gradT: Math.random(),
    alpha: 0.35 + Math.random() * 0.45,
  };
}

export function renderParticles(
  ctx: CanvasRenderingContext2D,
  g: ParticlesGeometry,
  rc: RenderContext,
  deltaSec: number
): void {
  const c = rc.theme.colors;
  const { frame } = rc;
  // audio influence: slow rise + beat impulse, bounded so it stays atmospheric
  const impulse = frame.beat;
  const bass = frame.bands[0] ?? 0;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < g.particles.length; i++) {
    const p = g.particles[i];

    // respawn when drifting off the top
    if (p.y < -20) {
      const fresh = spawn(rc.width, rc.height, Math.random(), Math.random() * 2 - 1);
      fresh.x = Math.random() * rc.width;
      fresh.y = rc.height + Math.random() * 20;
      g.particles[i] = fresh;
      continue;
    }

    // drift: gentle sine sway + steady rise, sped up by bass, pulsed by beat
    const sway = Math.sin(rc.time * 0.8 + p.phase) * 0.6;
    p.x += (p.vx * 0.4 + sway + (p.seed - 0.5) * impulse * 60) * deltaSec;
    p.y -= (p.vy * (0.6 + bass * 0.8 + impulse * 1.6)) * deltaSec;

    const brightness = p.alpha * (0.55 + bass * 0.6 + impulse * 0.5);
    const color = sampleGradient(c.gradient, p.gradT);
    ctx.fillStyle = hexToRgba(color, Math.min(0.9, brightness));
    ctx.shadowColor = color;
    ctx.shadowBlur = p.size * 2.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
