import { createBandRanges, reduceBands, createPerceptualWeights, applyNoiseGate, BandRange } from './frequencyBands';
import { BandSmoother, PeakTracker } from './smoothing';
import { BeatDetector } from './beatDetector';

export interface FrameData {
  bands: Float32Array; // 0..1 smoothed per-band energy
  peaks: Float32Array; // 0..1 per-band peak trail
  waveform: Uint8Array; // time-domain samples (getByteTimeDomainData)
  beat: number; // 0..1 bass impulse
  avgVolume: number; // 0..1 overall energy
}

export interface AnalyzerConfig {
  bandCount: number;
  fftSize: number;
  smoothingAttackRate: number;
  smoothingReleaseRate: number;
  peakFallPerSecond: number;
  bassBands: number;
  beatTriggerFactor: number;
}

export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  bandCount: 48,
  fftSize: 2048,
  smoothingAttackRate: 24,
  smoothingReleaseRate: 4,
  peakFallPerSecond: 0.5,
  bassBands: 6,
  beatTriggerFactor: 1.8,
};

// Owns per-run analysis state: band mapping, smoothing, peaks, beat, waveform
// buffer. Pure of DOM/canvas — analyser node passed in per frame.
export class AudioAnalyzer {
  readonly bandCount: number;
  readonly fftSize: number;
  readonly binCount: number;
  readonly freqData: Uint8Array;
  readonly waveform: Uint8Array;

  private ranges: BandRange[];
  private raw: Float32Array;
  private weights: Float32Array;
  private smoother: BandSmoother;
  private peaks: PeakTracker;
  private beat: BeatDetector;

  constructor(config: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG) {
    this.bandCount = config.bandCount;
    this.fftSize = config.fftSize;
    this.binCount = config.fftSize / 2;
    this.ranges = createBandRanges(this.binCount, config.bandCount);
    this.freqData = new Uint8Array(this.binCount);
    this.waveform = new Uint8Array(config.fftSize);
    this.raw = new Float32Array(config.bandCount);
    this.weights = createPerceptualWeights(config.bandCount);
    this.smoother = new BandSmoother(config.bandCount, {
      attackRate: config.smoothingAttackRate,
      releaseRate: config.smoothingReleaseRate,
      peakFallPerSecond: config.peakFallPerSecond,
    });
    this.peaks = new PeakTracker(config.bandCount, {
      attackRate: config.smoothingAttackRate,
      releaseRate: config.smoothingReleaseRate,
      peakFallPerSecond: config.peakFallPerSecond,
    });
    this.beat = new BeatDetector({
      bassBands: config.bassBands,
      triggerFactor: config.beatTriggerFactor,
    });
  }

  // Pulls a full frame of analysis. Call once per render tick.
  //
  // Signal contract (all band values are 0..1):
  //   raw FFT (0..255)
  //     -> reduceBands (0..1)
  //     -> perceptual weighting
  //     -> clamp to 0..1            <- weighting may exceed 1; never explode
  //     -> noise gate
  //     -> beat detector (raw bass, responsive)
  //     -> smoother  (renderers)
  //     -> peak tracker
  analyze(analyser: AnalyserNode, timeSec: number, deltaSec: number): FrameData {
    analyser.getByteFrequencyData(this.freqData);
    analyser.getByteTimeDomainData(this.waveform);
    reduceBands(this.freqData, this.ranges, this.raw);
    for (let b = 0; b < this.raw.length; b++) {
      const w = this.raw[b] * this.weights[b];
      this.raw[b] = w > 1 ? 1 : w; // clamp weighted energy back to 0..1
    }
    applyNoiseGate(this.raw, 0.012);
    // Beat detector sees the RAW weighted bass (pre-smoothing) so transients
    // stay responsive; renderers see the smoothed bands.
    const beat = this.beat.update(this.raw, timeSec, deltaSec);
    const bands = this.smoother.update(this.raw, deltaSec);
    const peaks = this.peaks.update(bands, deltaSec);

    let sum = 0;
    for (let i = 0; i < bands.length; i++) sum += bands[i];

    return {
      bands,
      peaks,
      waveform: this.waveform,
      beat,
      avgVolume: bands.length ? sum / bands.length : 0,
    };
  }

  reset(): void {
    this.smoother.reset();
    this.peaks.reset();
    this.beat.reset();
  }
}
