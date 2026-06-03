import type { GraphNode, ResolvedAccessors } from '../../domain/types';
import {
  MAJOR_PLANET_LIMIT_ALL,
  MAJOR_PLANET_LIMIT_GROUP,
  maxDegreeForMode as computeMaxDegreeForMode,
  planetSizeMultiplierForDegree,
  selectPlanetOverlayNodesBySizing,
  type NodeDegree,
  type PlanetSizingMode,
  type ResolvedPlanetSizing,
  type SceneNodeIndex,
} from '../sceneData';
import { PLANET_RADIUS_FACTOR } from '../sceneConstants';

export interface NodeSizingDeps<NMeta = unknown, EMeta = unknown> {
  nodes: () => readonly GraphNode<NMeta>[];
  nodeDegrees: () => ReadonlyMap<string, NodeDegree>;
  nodeIndex: () => SceneNodeIndex<NMeta>;
  planetSizing: () => ResolvedPlanetSizing;
  activeGroup: () => string | null;
  accessors: () => ResolvedAccessors<NMeta, EMeta>;
}

export interface NodeSizing<NMeta = unknown> {
  maxDegreeForMode(mode: PlanetSizingMode): number;
  selectPlanetOverlayNodes(): GraphNode<NMeta>[];
  planetSizeMultiplier(node: GraphNode<NMeta>, maxDegree?: number): number;
  planetRadius(node: GraphNode<NMeta>, maxDegree?: number): number;
  clearRankedCache(): void;
}

/**
 * Planet sizing math for the major-node overlay. Owns the per-mode ranking cache and
 * derives a node's render radius from its degree under the active sizing mode. Reads the
 * live dataset/degrees/index through getters so it stays correct after incremental append.
 */
export function createNodeSizing<NMeta = unknown, EMeta = unknown>(
  deps: NodeSizingDeps<NMeta, EMeta>,
): NodeSizing<NMeta> {
  const rankedPlanetNodes = new Map<PlanetSizingMode, GraphNode<NMeta>[]>();

  function maxDegreeForMode(mode: PlanetSizingMode) {
    return computeMaxDegreeForMode(deps.nodes(), deps.nodeDegrees(), mode, deps.activeGroup());
  }

  function selectPlanetOverlayNodes() {
    return selectPlanetOverlayNodesBySizing(
      deps.nodeIndex(),
      deps.nodes(),
      deps.nodeDegrees(),
      deps.planetSizing().mode,
      deps.activeGroup(),
      MAJOR_PLANET_LIMIT_ALL,
      MAJOR_PLANET_LIMIT_GROUP,
      rankedPlanetNodes,
    );
  }

  function planetSizeMultiplier(node: GraphNode<NMeta>, maxDegree = maxDegreeForMode(deps.planetSizing().mode)) {
    return planetSizeMultiplierForDegree(deps.nodeDegrees().get(node.id), deps.planetSizing(), maxDegree);
  }

  function planetRadius(node: GraphNode<NMeta>, maxDegree?: number) {
    return deps.accessors().nodeSize(node) * PLANET_RADIUS_FACTOR * planetSizeMultiplier(node, maxDegree);
  }

  return {
    maxDegreeForMode,
    selectPlanetOverlayNodes,
    planetSizeMultiplier,
    planetRadius,
    clearRankedCache: () => rankedPlanetNodes.clear(),
  };
}
