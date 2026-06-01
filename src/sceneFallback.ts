import { formatCompactNumber } from './data';
import type { GraphDataset } from './types';

export type GalaxySceneFailureReason = 'webgl-unavailable' | 'context-lost' | 'scene-error';

export interface GalaxySceneFailure {
  reason: GalaxySceneFailureReason;
  message: string;
  error?: unknown;
}

export interface SceneFallbackViewModel {
  canRetry: boolean;
  counts: {
    clusters: string;
    edges: string;
    nodes: string;
  };
  message: string;
  title: string;
}

export function createSceneFallbackViewModel<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  failure: GalaxySceneFailure,
): SceneFallbackViewModel {
  return {
    canRetry: failure.reason === 'context-lost' || failure.reason === 'scene-error',
    counts: {
      clusters: formatCompactNumber(dataset.clusters?.length ?? 0),
      edges: formatCompactNumber(dataset.edges.length),
      nodes: formatCompactNumber(dataset.nodes.length),
    },
    message: failure.message,
    title:
      failure.reason === 'context-lost'
        ? 'WebGL context lost'
        : failure.reason === 'webgl-unavailable'
          ? 'WebGL unavailable'
          : 'Scene could not start',
  };
}
