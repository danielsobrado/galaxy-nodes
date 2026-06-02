import {
  DEFAULT_PLANET_SIZE_MAX,
  DEFAULT_PLANET_SIZE_MIN,
  DEFAULT_PLANET_SIZE_STRENGTH,
  DENSITY_MIN_SCALE,
  DENSITY_REFERENCE_COUNT,
  SCALE_RENDER_ELEMENT_THRESHOLD,
} from './sceneConstants';
import type { PlanetSizingMode, ResolvedPlanetSizing } from './sceneData';

export type GalaxyRenderMode = 'auto' | 'quality' | 'scale';
export type EdgeRenderMode = 'tube' | 'line';

export interface GalaxyPlanetSizingOptions {
  /** `degree` uses all links, `incoming` uses target links, `outgoing` uses source links, `accessor` uses nodeSize only. */
  mode?: PlanetSizingMode;
  /** Multiplier applied to the final planet radius. */
  scale?: number;
  /** Lower visual multiplier for degree-based sizing. */
  min?: number;
  /** Upper visual multiplier for degree-based sizing. */
  max?: number;
  /** Higher values make hubs separate more strongly from low-degree nodes. */
  strength?: number;
}

export interface GalaxyGraphTheme {
  background?: string;
  panelAccentColor?: string;
  selectedColor?: string;
}

const DEFAULT_PLANET_SIZING: ResolvedPlanetSizing = {
  mode: 'accessor',
  scale: 1,
  min: DEFAULT_PLANET_SIZE_MIN,
  max: DEFAULT_PLANET_SIZE_MAX,
  strength: DEFAULT_PLANET_SIZE_STRENGTH,
};

/**
 * Pick the edge render tier. Honors an explicit `renderMode`, otherwise compares the
 * larger of the declared `expectedSize` and the current element count against the
 * measured scale threshold (see scripts/browser-perf.mjs).
 */
export function resolveEdgeRenderMode(
  nodeCount: number,
  edgeCount: number,
  expectedSize: number | undefined,
  renderMode: GalaxyRenderMode | undefined,
): EdgeRenderMode {
  if (renderMode === 'quality') return 'tube';
  if (renderMode === 'scale') return 'line';
  const elements = Math.max(expectedSize ?? 0, nodeCount + edgeCount);
  return elements >= SCALE_RENDER_ELEMENT_THRESHOLD ? 'line' : 'tube';
}

/**
 * Adaptive per-element opacity multiplier that keeps dense scenes from saturating
 * to white. Returns 1 at or below {@link DENSITY_REFERENCE_COUNT}, then tapers as
 * sqrt(reference / count), floored at {@link DENSITY_MIN_SCALE}.
 */
export function resolveDensityScale(count: number): number {
  if (count <= DENSITY_REFERENCE_COUNT) return 1;
  return Math.max(DENSITY_MIN_SCALE, Math.min(1, Math.sqrt(DENSITY_REFERENCE_COUNT / count)));
}

export function resolvePlanetSizing(planetSizing?: GalaxyPlanetSizingOptions): ResolvedPlanetSizing {
  return {
    ...DEFAULT_PLANET_SIZING,
    ...planetSizing,
  };
}
