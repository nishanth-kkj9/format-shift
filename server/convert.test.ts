import { describe, it, expect } from 'vitest';
import { imageFilters } from './ffmpeg/filters';
import { validateOptions, InvalidOptionError } from './convert';
import {
  acquireFFmpegSlot,
  releaseFFmpegSlot,
  ServerBusyError,
  sanitizeFfmpegStderr,
  getFFmpegConcurrency,
} from './ffmpeg/runner';

describe('imageFilters', () => {
  it('returns empty args for default options', () => {
    expect(imageFilters({ targetFormat: 'png', category: 'image' })).toEqual([]);
  });

  it('adds grayscale filter', () => {
    const result = imageFilters({ targetFormat: 'png', category: 'image', grayscale: true });
    expect(result).toContain('-vf');
    expect(result.join(' ')).toContain('format=gray');
  });

  it('adds rotation filter', () => {
    const result = imageFilters({ targetFormat: 'png', category: 'image', rotation: 90 });
    expect(result.join(' ')).toContain('transpose=0');
  });

  it('adds scale filter for maxWidth', () => {
    const result = imageFilters({ targetFormat: 'png', category: 'image', maxWidth: 1920 });
    expect(result.join(' ')).toContain('scale=1920:-2');
  });

  it('adds quality args for jpg', () => {
    const result = imageFilters({ targetFormat: 'jpg', category: 'image', quality: 90 });
    expect(result).toContain('-q:v');
  });

  it('adds quality args for webp', () => {
    const result = imageFilters({ targetFormat: 'webp', category: 'image', quality: 85 });
    expect(result).toContain('-quality');
    expect(result).toContain('85');
  });

  it('adds crf for avif', () => {
    const result = imageFilters({ targetFormat: 'avif', category: 'image', quality: 90 });
    expect(result).toContain('-crf');
  });

  it('adds ico scale', () => {
    const result = imageFilters({ targetFormat: 'ico', category: 'image' });
    expect(result.join(' ')).toContain('scale=32:32');
  });
});

describe('validateOptions', () => {
  it('passes valid options', () => {
    const opts = {
      targetFormat: 'jpg',
      category: 'image',
      quality: 85,
      rotation: 90,
      maxWidth: 1920,
      maxHeight: 1080,
    };
    expect(() => validateOptions(opts)).not.toThrow();
  });

  it('rejects quality out of range (0)', () => {
    expect(() => validateOptions({ targetFormat: 'jpg', category: 'image', quality: 0 }))
      .toThrow(InvalidOptionError);
  });

  it('rejects quality out of range (101)', () => {
    expect(() => validateOptions({ targetFormat: 'jpg', category: 'image', quality: 101 }))
      .toThrow(InvalidOptionError);
  });

  it('rejects invalid rotation', () => {
    expect(() => validateOptions({ targetFormat: 'jpg', category: 'image', rotation: 45 }))
      .toThrow(InvalidOptionError);
  });

  it('accepts valid rotations (0, 90, 180, 270)', () => {
    for (const r of [0, 90, 180, 270]) {
      expect(() => validateOptions({ targetFormat: 'jpg', category: 'image', rotation: r })).not.toThrow();
    }
  });

  it('rejects invalid bitrate', () => {
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', bitrate: '500k' }))
      .toThrow(InvalidOptionError);
  });

  it('accepts valid bitrates', () => {
    for (const b of ['128k', '192k', '256k', '320k']) {
      expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', bitrate: b })).not.toThrow();
    }
  });

  it('rejects invalid sampleRate', () => {
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', sampleRate: 32000 }))
      .toThrow(InvalidOptionError);
  });

  it('accepts valid sampleRates', () => {
    for (const sr of [8000, 11025, 22050, 44100, 48000, 96000]) {
      expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', sampleRate: sr })).not.toThrow();
    }
  });

  it('rejects invalid channels', () => {
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', channels: 3 }))
      .toThrow(InvalidOptionError);
  });

  it('accepts valid channels (1, 2)', () => {
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', channels: 1 })).not.toThrow();
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', channels: 2 })).not.toThrow();
  });

  it('rejects volume out of range (negative)', () => {
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', volume: -10 }))
      .toThrow(InvalidOptionError);
  });

  it('rejects volume out of range (>200)', () => {
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', volume: 201 }))
      .toThrow(InvalidOptionError);
  });

  it('accepts valid volume (0-200)', () => {
    for (const v of [0, 50, 100, 150, 200]) {
      expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', volume: v })).not.toThrow();
    }
  });

  it('rejects negative trimStart', () => {
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', trimStart: -1 }))
      .toThrow(InvalidOptionError);
  });

  it('rejects negative trimEnd', () => {
    expect(() => validateOptions({ targetFormat: 'mp3', category: 'audio', trimEnd: -1 }))
      .toThrow(InvalidOptionError);
  });

  it('rejects invalid resolution', () => {
    expect(() => validateOptions({ targetFormat: 'mp4', category: 'video', resolution: '2k' }))
      .toThrow(InvalidOptionError);
  });

  it('accepts valid resolutions', () => {
    for (const r of ['original', '1080p', '720p', '480p', '360p']) {
      expect(() => validateOptions({ targetFormat: 'mp4', category: 'video', resolution: r })).not.toThrow();
    }
  });

  it('rejects invalid fps', () => {
    expect(() => validateOptions({ targetFormat: 'mp4', category: 'video', fps: 0 }))
      .toThrow(InvalidOptionError);
    expect(() => validateOptions({ targetFormat: 'mp4', category: 'video', fps: 121 }))
      .toThrow(InvalidOptionError);
  });

  it('accepts valid fps (1-120)', () => {
    for (const f of [1, 24, 30, 60, 120]) {
      expect(() => validateOptions({ targetFormat: 'mp4', category: 'video', fps: f })).not.toThrow();
    }
  });

  it('rejects invalid maxWidth', () => {
    expect(() => validateOptions({ targetFormat: 'jpg', category: 'image', maxWidth: 0 }))
      .toThrow(InvalidOptionError);
    expect(() => validateOptions({ targetFormat: 'jpg', category: 'image', maxWidth: 10001 }))
      .toThrow(InvalidOptionError);
  });

  it('rejects invalid maxHeight', () => {
    expect(() => validateOptions({ targetFormat: 'jpg', category: 'image', maxHeight: 0 }))
      .toThrow(InvalidOptionError);
    expect(() => validateOptions({ targetFormat: 'jpg', category: 'image', maxHeight: 10001 }))
      .toThrow(InvalidOptionError);
  });
});

describe('ffmpeg concurrency queue', () => {
  it('rejects new jobs with ServerBusyError when the queue is full', async () => {
    const { max } = getFFmpegConcurrency();
    const queueCap = max * 5;
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    for (let i = 0; i < queueCap; i++) {
      void acquireFFmpegSlot(); // parks in the queue; never awaited
    }
    try {
      await expect(acquireFFmpegSlot()).rejects.toBeInstanceOf(ServerBusyError);
    } finally {
      // one release per held job (max active + queueCap queued)
      for (let i = 0; i < max + queueCap; i++) releaseFFmpegSlot();
    }
  });

  it('queues a new job once a slot frees up', async () => {
    const { max } = getFFmpegConcurrency();
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    try {
      const pending = acquireFFmpegSlot();
      releaseFFmpegSlot(); // free one slot -> queued job resolves
      await pending;
      releaseFFmpegSlot(); // release the queued job's slot
    } finally {
      for (let i = 0; i < max - 1; i++) releaseFFmpegSlot();
    }
  });
});

describe('sanitizeFfmpegStderr', () => {
  it('strips pointer addresses and absolute temp paths', () => {
    const raw = [
      'frame=  1 fps=0.0 q=-0.0 size=N/A time=00:00:00.00 bitrate=N/A speed=0x',
      '[libx264 @ 0x7f8a4c003a00] using cpu capabilities',
      'Error opening input file /tmp/fs-up-ab12cd34ef5678/input-1234567890ab.bin',
      'C:\\Users\\user\\AppData\\Local\\Temp\\fs-up-x\\input-y.bin: No such file',
    ].join('\n');
    const clean = sanitizeFfmpegStderr(raw);
    expect(clean).not.toContain('0x7f8a4c003a00');
    expect(clean).not.toContain('/tmp/fs-up-');
    expect(clean).not.toContain('AppData');
    expect(clean).not.toContain('@ 0x');
    expect(clean).not.toContain('\n');
  });

  it('keeps the human-readable error line', () => {
    const clean = sanitizeFfmpegStderr('Invalid data found when processing input\n[mov @ 0x1] bad box\n');
    expect(clean).toContain('Invalid data found when processing input');
  });
});