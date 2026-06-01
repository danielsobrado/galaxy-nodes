import { describe, expect, it } from 'vitest';
import { resolveEdgeRenderMode } from './core';
import { SCALE_RENDER_ELEMENT_THRESHOLD } from './sceneConstants';

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
