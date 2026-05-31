import { createGalaxyRenderer } from './core';
import type { GalaxyRendererCallbacks, GalaxyRendererOptions } from './core';

export { createGalaxyRenderer };

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
  GraphAccessors,
  GraphCluster,
  GraphDataset,
  GraphEdge,
  GraphNode,
  SpaceDirection,
  Vec3,
} from './core';
