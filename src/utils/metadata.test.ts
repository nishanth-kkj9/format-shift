import { describe, it, expect } from 'vitest';
import { formatDuration } from './metadata';

describe('formatDuration', () => {
  it('formats zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats NaN as 0:00', () => {
    expect(formatDuration(NaN)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('pads seconds with leading zero', () => {
    expect(formatDuration(61)).toBe('1:01');
  });
});