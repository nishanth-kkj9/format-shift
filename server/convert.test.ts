import { describe, it, expect } from 'vitest';
import { imageFilters } from './convert';

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