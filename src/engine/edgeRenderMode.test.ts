import { describe, expect, it } from 'vitest';
import { resolveDensityScale, resolveEdgeRenderMode } from './core';
import { DENSITY_MIN_SCALE, DENSITY_REFERENCE_COUNT, SCALE_RENDER_ELEMENT_THRESHOLD } from './sceneConstants';

describe('resolveEdgeRenderMode', () => {
  it('honors an explicit render mode regardless of size', () => {
    expect(resolveEdgeRenderMode(1_000_000, 1_000_000, undefined, 'quality')).toBe('tube');
    expect(resolveEdgeRenderMode(1, 0, undefined, 'scale')).toBe('line');
  });

  it('auto-selects tube below the threshold and line at or above it', () => {
    expect(resolveEdgeRenderMode(10, 10, undefined, 'auto')).toBe('tube');
    expect(resolveEdgeRenderMode(SCALE_RENDER_ELEMENT_THRESHOLD - 1, 0, undefined, undefined)).toBe('tube');
    expect(resolveEdgeRenderMode(SCALE_RENDER_ELEMENT_THRESHOLD, 0, undefined, 'auto')).toBe('line');
  });

  it('uses the larger of expectedSize and the live count so streamed graphs pick the tier up front', () => {
    // A small initial chunk that will grow past the threshold still starts in line mode.
    expect(resolveEdgeRenderMode(50, 10, SCALE_RENDER_ELEMENT_THRESHOLD + 1, 'auto')).toBe('line');
    // A small hint never downgrades a graph that is already large.
    expect(resolveEdgeRenderMode(SCALE_RENDER_ELEMENT_THRESHOLD, 0, 5, 'auto')).toBe('line');
  });
});

describe('resolveDensityScale', () => {
  it('leaves graphs at or below the reference count untouched', () => {
    expect(resolveDensityScale(0)).toBe(1);
    expect(resolveDensityScale(DENSITY_REFERENCE_COUNT)).toBe(1);
  });

  it('tapers smoothly as density grows and never drops below the floor', () => {
    const at25k = resolveDensityScale(25_000);
    const at50k = resolveDensityScale(50_000);
    expect(at25k).toBeLessThan(1);
    expect(at50k).toBeLessThan(at25k);
    expect(resolveDensityScale(1_000_000)).toBe(DENSITY_MIN_SCALE);
    // sqrt(10000/40000) = 0.5
    expect(resolveDensityScale(40_000)).toBeCloseTo(0.5, 5);
  });
});
