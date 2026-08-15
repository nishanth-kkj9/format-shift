export interface SmoothingConfig {
  attackRate: number; // exponential rate (per second) when rising — fast
  releaseRate: number; // exponential rate (per second) when falling — slow
  peakFallPerSecond: number; // peak decay in normalized units (0..1) per second
}

export const DEFAULT_SMOOTHING: SmoothingConfig = {
  attackRate: 24,
  releaseRate: 4,
  peakFallPerSecond: 0.5,
};

// Frame-rate-independent exponential smoothing (1 - e^(-rate*dt)). Snap up to
// transients (attackRate), decay gently (releaseRate). Sustains energy without
// the flutter of raw bins.
export class BandSmoother {
  private value: Float32Array;
  private config: SmoothingConfig;

  constructor(bandCount: number, config: SmoothingConfig = DEFAULT_SMOOTHING) {
    this.value = new Float32Array(bandCount);
    this.config = config;
  }

  update(target: Float32Array, deltaSec: number): Float32Array {
    for (let i = 0; i < this.value.length; i++) {
      const t = target[i];
      const cur = this.value[i];
      if (t >= cur) {
        const k = 1 - Math.exp(-this.config.attackRate * deltaSec);
        this.value[i] = cur + (t - cur) * k;
      } else {
        const k = 1 - Math.exp(-this.config.releaseRate * deltaSec);
        this.value[i] = cur + (t - cur) * k;
      }
    }
    return this.value;
  }

  reset(): void {
    this.value.fill(0);
  }
}

// Per-band peak tracker: jumps to new highs instantly, falls at a fixed rate.
export class PeakTracker {
  private value: Float32Array;
  private config: SmoothingConfig;

  constructor(bandCount: number, config: SmoothingConfig = DEFAULT_SMOOTHING) {
    this.value = new Float32Array(bandCount);
    this.config = config;
  }

  update(smoothed: Float32Array, deltaSec: number): Float32Array {
    for (let i = 0; i < this.value.length; i++) {
      const s = smoothed[i];
      if (s > this.value[i]) {
        this.value[i] = s;
      } else {
        this.value[i] = Math.max(0, this.value[i] - this.config.peakFallPerSecond * deltaSec);
      }
    }
    return this.value;
  }

  reset(): void {
    this.value.fill(0);
  }
}
