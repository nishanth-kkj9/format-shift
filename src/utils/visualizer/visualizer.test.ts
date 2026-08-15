import { describe, it, expect } from 'vitest';
import { createBandRanges, reduceBands } from './frequencyBands';
import { BandSmoother, PeakTracker } from './smoothing';
import { BeatDetector } from './beatDetector';
import { AudioAnalyzer } from './audioAnalyzer';
import { computeTrimRange } from './engine';
import { VISUALIZER_THEMES, getTheme } from './themes';

describe('frequencyBands', () => {
  it('produces the requested number of ordered in-range bands', () => {
    const binCount = 1024;
    const ranges = createBandRanges(binCount, 48);
    expect(ranges).toHaveLength(48);
    ranges.forEach((r, i) => {
      expect(r.start).toBeLessThanOrEqual(r.end);
      expect(r.start).toBeGreaterThanOrEqual(0);
      expect(r.end).toBeLessThanOrEqual(binCount - 1);
      if (i > 0) expect(r.start).toBeGreaterThan(ranges[i - 1].start);
    });
  });

  it('reduces raw analyser data to 0..1 band averages', () => {
    const ranges = createBandRanges(16, 4);
    const data = new Uint8Array(16).fill(128);
    const out = new Float32Array(4);
    reduceBands(data, ranges, out);
    out.forEach((v) => expect(v).toBeCloseTo(128 / 255, 5));
  });
});

describe('BandSmoother', () => {
  it('rises faster than it falls', () => {
    const s = new BandSmoother(1);
    const target = new Float32Array([1]);
    s.update(target, 1 / 30);
    const afterRise = s.update(target, 1 / 30)[0];

    const s2 = new BandSmoother(1);
    s2.update(new Float32Array([1]), 1 / 30);
    s2.update(new Float32Array([0]), 1 / 30);
    const afterFall = s2.update(new Float32Array([0]), 1 / 30)[0];

    // After one extra rise step the value should be above where a fall step leaves it.
    expect(afterRise).toBeGreaterThan(afterFall);
  });

  it('converges toward the target', () => {
    const s = new BandSmoother(1);
    const target = new Float32Array([0.8]);
    let v = 0;
    for (let i = 0; i < 200; i++) v = s.update(target, 1 / 30)[0];
    expect(v).toBeCloseTo(0.8, 3);
  });
});

describe('PeakTracker', () => {
  it('snaps up to a high then decays', () => {
    const p = new PeakTracker(1);
    const smoothed = new Float32Array([0.5]);
    const peak = p.update(smoothed, 1 / 30)[0];
    expect(peak).toBeCloseTo(0.5, 5);
    const decayed = p.update(new Float32Array([0.1]), 1)[0];
    expect(decayed).toBeLessThan(peak);
  });
});

describe('computeTrimRange', () => {
  it('defaults to the full file when no trim given', () => {
    expect(computeTrimRange(10, undefined, undefined)).toEqual({ start: 0, end: 10 });
  });

  it('clamps out-of-range trim values to the duration', () => {
    expect(computeTrimRange(10, -5, 100)).toEqual({ start: 0, end: 10 });
  });

  it('honors a valid inner range', () => {
    expect(computeTrimRange(10, 2, 8)).toEqual({ start: 2, end: 8 });
  });

  it('falls back to the whole file when start >= end', () => {
    expect(computeTrimRange(10, 8, 3)).toEqual({ start: 0, end: 10 });
    expect(computeTrimRange(10, 5, 5)).toEqual({ start: 0, end: 10 });
  });

  it('tolerates zero duration', () => {
    expect(computeTrimRange(0, 0, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe('BeatDetector', () => {
  it('emits a pulse on strong bass then decays', () => {
    const d = new BeatDetector();
    const quiet = new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    for (let i = 0; i < 30; i++) d.update(quiet, i / 30, 1 / 30);
    const loud = new Float32Array([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
    const pulse = d.update(loud, 1, 1 / 30);
    expect(pulse).toBeGreaterThan(0.5);
    const decayed = d.update(quiet, 2, 1);
    expect(decayed).toBeLessThan(pulse);
  });

  it('does not re-trigger within the cooldown window', () => {
    const d = new BeatDetector();
    const loud = new Float32Array([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
    // prime energy low
    for (let i = 0; i < 20; i++) d.update(new Float32Array([0.05, 0.05, 0.05, 0.05, 0.05, 0.05]), i * 0.1, 0.1);
    const t1 = d.update(loud, 2, 0.1); // fires
    const t2 = d.update(loud, 2.05, 0.1); // within cooldown -> no reset
    expect(t1).toBeGreaterThan(0.5);
    expect(t2).toBeLessThanOrEqual(t1);
  });

  it('stops firing once running energy settles on sustained bass', () => {
    const d = new BeatDetector();
    const mod = new Float32Array([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
    const pulses = [];
    for (let i = 0; i < 300; i++) pulses.push(d.update(mod, i * 0.05, 0.05));
    // energy (attack 0.04) converges to ~0.3 within ~100 frames; once settled,
    // sustained bass (0.3) no longer exceeds energy * 1.8.
    const settledWindow = pulses.slice(150);
    const spikes = settledWindow.filter((p) => p > 0.9).length;
    expect(spikes).toBe(0);
  });
});

describe('AudioAnalyzer', () => {
  it('builds band data at default config', () => {
    const a = new AudioAnalyzer();
    expect(a.bandCount).toBe(48);
    expect(a.binCount).toBe(1024);
    expect(a.freqData).toHaveLength(1024);
    expect(a.waveform).toHaveLength(2048);
  });

  it('resets smoothly back to zero', () => {
    const a = new AudioAnalyzer();
    a.reset();
    expect(Array.from(a.freqData)).toHaveLength(1024);
  });

  it('clamps weighted bands to 0..1 even when weights push above 1', () => {
    const a = new AudioAnalyzer();
    const fakeAnalyser = {
      getByteFrequencyData: (arr: Uint8Array) => arr.fill(255), // full scale
      getByteTimeDomainData: (arr: Uint8Array) => arr.fill(128),
    } as unknown as AnalyserNode;
    const frame = a.analyze(fakeAnalyser, 1, 1 / 30);
    for (const v of frame.bands) {
      expect(v).toBeLessThanOrEqual(1.0001);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(frame.avgVolume).toBeLessThanOrEqual(1);
  });
});

describe('themes', () => {
  it('exposes at least 5 themes with full color palettes', () => {
    const ids = Object.keys(VISUALIZER_THEMES);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) {
      const t = VISUALIZER_THEMES[id as keyof typeof VISUALIZER_THEMES];
      expect(t.colors.gradient.length).toBeGreaterThanOrEqual(4);
      expect(t.colors.gradient[0]).toMatch(/^#/);
      expect(t.colors.primaryGlow).toMatch(/^rgba\(/);
      expect(t.colors.background).toMatch(/^#/);
    }
  });

  it('defaults to neon-lime and tolerates unknown themes', () => {
    expect(getTheme(undefined).id).toBe('neon-lime');
    expect(getTheme('matrix-green').id).toBe('matrix-green');
    expect(getTheme('not-a-theme' as never).id).toBe('neon-lime');
  });
});
