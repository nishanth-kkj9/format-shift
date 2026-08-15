export interface BandRange {
  start: number;
  end: number;
}

// Map analyser frequency bins (0..binCount-1) into `bandCount` perceptual bands
// with log spacing — bass bins get few bins per band, treble more. Cache once,
// never recompute per frame. Ranges are strictly increasing and in-bounds.
export function createBandRanges(binCount: number, bandCount: number): BandRange[] {
  const ranges: BandRange[] = [];
  const logMin = Math.log10(1);
  const logMax = Math.log10(Math.max(1, binCount - 1));

  let prevEnd = -1;
  for (let b = 0; b < bandCount; b++) {
    const lo = Math.pow(10, logMin + (logMax - logMin) * (b / bandCount));
    const hi = Math.pow(10, logMin + (logMax - logMin) * ((b + 1) / bandCount));
    let start = Math.max(prevEnd + 1, Math.round(lo));
    let end = Math.max(start, Math.min(binCount - 1, Math.ceil(hi)));
    end = Math.max(start, end);
    ranges.push({ start, end });
    prevEnd = end;
  }
  return ranges;
}

export interface BandConfig {
  ranges: BandRange[];
}

// Aggregate raw analyser data (0..255) into band averages (0..1).
export function reduceBands(
  data: Uint8Array,
  ranges: BandRange[],
  out: Float32Array
): void {
  for (let b = 0; b < ranges.length; b++) {
    const { start, end } = ranges[b];
    let sum = 0;
    for (let i = start; i <= end; i++) sum += data[i];
    out[b] = sum / (end - start + 1) / 255;
  }
}

// Perceptual weighting curve applied after band reduction:
//   bass  -> 1.25  (strong visual kick, controlled)
//   low-mid -> ~1.05
//   treble -> 0.72 (detailed but damped so tiny high-freq noise stays quiet)
// Uses a smooth monotonic falloff; never amplifies past a safe ceiling.
export function createPerceptualWeights(bandCount: number): Float32Array {
  const weights = new Float32Array(bandCount);
  for (let b = 0; b < bandCount; b++) {
    const t = bandCount > 1 ? b / (bandCount - 1) : 0;
    weights[b] = 1.25 - 0.3 * t - 0.23 * t * t;
  }
  return weights;
}

// Soft noise gate: zero out near-silent bands so quiet passages stay quiet
// and treble hiss doesn't create visual activity.
export function applyNoiseGate(bands: Float32Array, floor: number): void {
  for (let b = 0; b < bands.length; b++) {
    if (bands[b] < floor) bands[b] = 0;
  }
}
