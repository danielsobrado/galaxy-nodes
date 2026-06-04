import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { edgeSceneColor, edgeSceneColorHex } from './materials';
import { resolveGalaxyGraphTheme } from './rendererConfig';

function lightnessOf(hex: string): number {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl);
  return hsl.l;
}

describe('edgeSceneColorHex', () => {
  it('darkens bright relationship colors for legibility on white', () => {
    const theme = resolveGalaxyGraphTheme('network-light');

    // Bright cyan, gold, and grey should all become clearly dark so they read on white.
    for (const color of ['#6bd7ff', '#f5cf5b', '#6b7280', '#a78bfa']) {
      const toned = edgeSceneColorHex(color, theme);
      expect(toned).toMatch(/^#[0-9a-f]{6}$/i);
      expect(lightnessOf(toned)).toBeLessThanOrEqual(0.4);
    }
  });

  it('leaves colors unchanged on galaxy dark', () => {
    const theme = resolveGalaxyGraphTheme('galaxy-dark');
    expect(edgeSceneColorHex('#6bd7ff', theme)).toBe('#6bd7ff');
  });

  it('returns a fresh color instance per call so callers can hold the result', () => {
    const theme = resolveGalaxyGraphTheme('network-light');
    const first = edgeSceneColor('#6bd7ff', theme);
    const second = edgeSceneColor('#f5cf5b', theme);

    expect(first).not.toBe(second);
  });
});
