import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { nodeSceneColorHex, pointCloudColor } from './materials';
import { resolveGalaxyGraphTheme } from './rendererConfig';

function lightnessOf(hex: string): number {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl);
  return hsl.l;
}

describe('nodeSceneColorHex', () => {
  it('darkens near-white codegraph symbol colors on network light', () => {
    const theme = resolveGalaxyGraphTheme('network-light');

    for (const color of ['#eef7f4', '#aeb8c2']) {
      const toned = nodeSceneColorHex(color, theme);
      expect(lightnessOf(toned)).toBeLessThanOrEqual(0.45);
      expect(lightnessOf(toned)).toBeGreaterThan(0.2);
    }
  });

  it('keeps the additive glow lift on galaxy dark', () => {
    const theme = resolveGalaxyGraphTheme('galaxy-dark');
    expect(nodeSceneColorHex('#aeb8c2', theme)).toBe(`#${pointCloudColor('#aeb8c2').getHexString()}`);
  });
});
