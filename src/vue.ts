import { createGalaxyRenderer } from './core';
import type { GalaxyRendererCallbacks, GalaxyRendererOptions } from './core';

export { createGalaxyRenderer, DEFAULT_GRAPH_EDGE_BUDGET, mergeGraphDataset } from './core';

/**
 * Vue-named alias for the imperative core renderer. It does not install Vue
 * components or manage lifecycle; call it from your component mount hooks.
 */
export function createGalaxyVueRenderer<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
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
  SpaceDirection,
  Vec3,
} from './core';
