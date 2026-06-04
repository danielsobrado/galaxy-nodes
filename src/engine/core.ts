import { createGalaxyRendererController } from './rendererLifecycle';
import type { GalaxyRenderer, GalaxyRendererCallbacks, GalaxyRendererOptions } from './rendererTypes';
import { createScene } from './scene/createScene';

export { getGalaxyRendererContextBudget } from './environment';
export type { GalaxyMotionPreference, GalaxyRendererContextBudget } from './environment';
export {
  GALAXY_GRAPH_THEME_CHOICES,
  GALAXY_GRAPH_THEMES,
  resolveDensityScale,
  resolveEdgeRenderMode,
  resolveGalaxyGraphTheme,
} from './rendererConfig';
export type {
  EdgeRenderMode,
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
  GalaxyPlanetSizingOptions,
  GalaxyRenderMode,
  ResolvedGalaxyGraphTheme,
} from './rendererConfig';
export type {
  CameraCommand,
  GalaxyNodeHoverAnchor,
  GalaxyRenderer,
  GalaxyRendererCallbacks,
  GalaxyRendererOptions,
  GraphCameraState,
  GraphUxEvent,
  GraphUxVariant,
} from './rendererTypes';
export type { GalaxySceneFailure, GalaxySceneFailureReason } from './sceneFallback';

export function createGalaxyRenderer<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLElement,
  options: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
  callbacks: GalaxyRendererCallbacks<NMeta, EMeta> = {},
): GalaxyRenderer<NMeta, EMeta, CMeta> {
  return createGalaxyRendererController(host, options, callbacks, createScene);
}

export {
  defaultEdgeColor,
  defaultEdgeLabel,
  defaultEdgeWeight,
  defaultNodeColor,
  defaultNodeImage,
  defaultNodeLabel,
  defaultNodeRing,
  defaultNodeSize,
  DEFAULT_GRAPH_EDGE_BUDGET,
  formatCompactNumber,
  getEdgeId,
  mergeGraphDataset,
  parseGraphDataset,
  resolveAccessors,
} from '../domain/data';
export type { MergeGraphDatasetOptions, ParsedGraphDataset } from '../domain/data';
export { resolveGraphLayout } from '../domain/layout';
export type {
  GraphLayoutInput,
  GraphLayoutOptions,
  ResolvedGraphLayout,
  ResolvedLayoutCluster,
} from '../domain/layout';
export type { PlanetSizingMode } from './sceneData';
export type {
  EdgeEndpoint,
  GalaxyCameraView,
  GraphAccessors,
  GraphCluster,
  GraphDataset,
  GraphDatasetPatch,
  GraphEdge,
  GraphNode,
  ResolvedAccessors,
  SpaceDirection,
  Vec3,
} from '../domain/types';
