import { RenderContext, TAU, hexToRgba } from './shared';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hueIndex: number;
  life: number; // 0..1 remaining
}

export interface ParticlesGeometry {
  particles: Particle[];
  count: number;
  emitRate: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function createParticlesGeometry(width: number, height: number): ParticlesGeometry {
  const count = 140;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: rand(-12, 12),
      vy: rand(20, 80),
      size: rand(1.5, 4.5),
      hueIndex: Math.floor(Math.random() * 3),
      life: Math.random(),
    });
  }
  return { particles, count, emitRate: 0.6 };
}

// Rising embers whose speed scales with overall volume and bass.
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  g: ParticlesGeometry,
  rc: RenderContext,
  deltaSec: number
): void {
  const c = rc.theme.colors;
  const { frame } = rc;
  const speedScale = 1 + frame.avgVolume * 2.2 + frame.beat * 2.5;
  const spawnRate = g.emitRate + frame.avgVolume * 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = c.primaryGlow;

  for (let i = 0; i < g.particles.length; i++) {
    const p = g.particles[i];
    p.life -= deltaSec * 0.25;
    if (p.life <= 0) {
      p.life = 1;
      p.x = Math.random() * rc.width;
      p.y = rc.height + rand(0, 40);
      p.vx = rand(-12, 12);
      p.vy = rand(24, 90);
      p.size = rand(1.5, 4.5);
      p.hueIndex = Math.floor(Math.random() * 3);
    }
    p.x += p.vx * speedScale * deltaSec;
    p.y -= p.vy * speedScale * deltaSec;

    if (Math.random() < spawnRate * deltaSec) {
      p.x += rand(-30, 30);
      p.y -= rand(0, 60);
    }

    const alpha = Math.min(0.85, p.life * (0.25 + frame.bands[(p.hueIndex * 9) % Math.max(1, frame.bands.length)] * 0.75));
    ctx.fillStyle = hexToRgba(c.gradient[p.hueIndex], alpha);
    ctx.shadowBlur = p.size * 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
