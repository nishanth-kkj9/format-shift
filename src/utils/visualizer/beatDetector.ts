export interface BeatConfig {
  bassBands: number; // number of lowest bands feeding the detector
  energyAttack: number; // smooth factor for running energy average
  triggerFactor: number; // beat fires when energy exceeds average * factor
  minThreshold: number; // absolute floor
  decayPerSecond: number; // pulse decay back to 0
}

export const DEFAULT_BEAT_CONFIG: BeatConfig = {
  bassBands: 6,
  energyAttack: 0.04,
  triggerFactor: 1.8,
  minThreshold: 0.16,
  decayPerSecond: 3.2,
};

// Bass-energy impulse detector. Emits a 0..1 decaying pulse on downbeats.
// Subtle by design — renderers use it for a gentle radius pulse, not strobes.
export class BeatDetector {
  private config: BeatConfig;
  private energy = 0;
  private pulse = 0;
  private lastTrigger = -Infinity;

  constructor(config: Partial<BeatConfig> = {}) {
    this.config = { ...DEFAULT_BEAT_CONFIG, ...config };
  }

  update(bands: Float32Array, timeSec: number, deltaSec: number): number {
    let bass = 0;
    const n = Math.min(this.config.bassBands, bands.length);
    for (let i = 0; i < n; i++) bass += bands[i];
    bass /= n;

    const a = this.config.energyAttack;
    this.energy = this.energy * (1 - a) + bass * a;

    this.pulse = Math.max(0, this.pulse - this.config.decayPerSecond * deltaSec);

    if (
      bass >= this.config.minThreshold &&
      bass >= this.energy * this.config.triggerFactor &&
      timeSec - this.lastTrigger > 0.25
    ) {
      this.pulse = 1;
      this.lastTrigger = timeSec;
    }

    return this.pulse;
  }

  reset(): void {
    this.energy = 0;
    this.pulse = 0;
    this.lastTrigger = -Infinity;
  }
}
