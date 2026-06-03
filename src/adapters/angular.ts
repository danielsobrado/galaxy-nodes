import { createGalaxyRenderer } from '../engine/core';
import type { GalaxyRendererCallbacks, GalaxyRendererOptions } from '../engine/core';

export {
  createGalaxyRenderer,
  DEFAULT_GRAPH_EDGE_BUDGET,
  GALAXY_GRAPH_THEME_CHOICES,
  GALAXY_GRAPH_THEMES,
  getGalaxyRendererContextBudget,
  mergeGraphDataset,
  resolveGalaxyGraphTheme,
} from '../engine/core';

/**
 * Angular-named alias for the imperative core renderer. It does not declare
 * Angular components or manage lifecycle; call it from component hooks.
 */
export function createGalaxyAngularRenderer<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLElement,
  options: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
  callbacks?: GalaxyRendererCallbacks<NMeta, EMeta>,
) {
  return createGalaxyRenderer(host, options, callbacks);
}

export type {
  CameraCommand,
  GalaxyGraphBlendMode,
  GalaxyGraphDataColorStrategy,
  GalaxyGraphPointStyle,
  GalaxyGraphTheme,
  GalaxyGraphThemeChrome,
  GalaxyGraphThemeChoice,
  GalaxyGraphThemeId,
  GalaxyGraphThemeInput,
  GalaxyGraphThemeMode,
  GalaxyGraphThemeScene,
  GalaxyGraphToneMapping,
  GalaxyMotionPreference,
  GalaxyNodeHoverAnchor,
  GalaxyPlanetSizingOptions,
  GalaxyRenderer,
  GalaxyRendererCallbacks,
  GalaxyRendererContextBudget,
  GalaxyRendererOptions,
  GalaxySceneFailure,
  GalaxySceneFailureReason,
  GalaxyCameraView,
  GraphAccessors,
  GraphCluster,
  GraphDataset,
  GraphDatasetPatch,
  GraphEdge,
  GraphNode,
  PlanetSizingMode,
  ResolvedGalaxyGraphTheme,
  SpaceDirection,
  Vec3,
} from '../engine/core';
