import { createGalaxyRenderer } from '../engine/core';
import type { GalaxyRendererCallbacks, GalaxyRendererOptions } from '../engine/core';

export {
  createGalaxyRenderer,
  DEFAULT_GRAPH_EDGE_BUDGET,
  getGalaxyRendererContextBudget,
  mergeGraphDataset,
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
  GalaxyGraphTheme,
  GalaxyMotionPreference,
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
  SpaceDirection,
  Vec3,
} from '../engine/core';
