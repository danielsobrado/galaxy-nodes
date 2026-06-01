import type { GraphDataset, GraphEdge, GraphNode } from './types';

export const MAJOR_PLANET_LIMIT_ALL = 96;
export const MAJOR_PLANET_LIMIT_GROUP = 48;

// Major nodes get bumped up the ranking by this fraction of the max degree,
// plus a flat +1 tiebreaker, so they outrank equally-connected minor nodes.
export const MAJOR_PLANET_RANK_BONUS = 0.22;

export type PlanetSizingMode = 'accessor' | 'degree' | 'incoming' | 'outgoing';

export interface NodeDegree {
  incoming: number;
  outgoing: number;
  total: number;
}

export interface ResolvedPlanetSizing {
  mode: PlanetSizingMode;
  scale: number;
  min: number;
  max: number;
  strength: number;
}

export interface SceneNodeIndex<NMeta = unknown> {
  allPointIndexes: number[];
  pointIndexByNodeId: Map<string, number>;
  pointIndexesByGroup: Map<string, number[]>;
  majorNodesAll: GraphNode<NMeta>[];
  majorNodesByGroup: Map<string, GraphNode<NMeta>[]>;
}

export function buildSceneNodeIndex<NMeta = unknown>(nodes: GraphNode<NMeta>[]): SceneNodeIndex<NMeta> {
  const allPointIndexes: number[] = [];
  const pointIndexByNodeId = new Map<string, number>();
  const pointIndexesByGroup = new Map<string, number[]>();
  const majorNodesAll: GraphNode<NMeta>[] = [];
  const majorNodesByGroup = new Map<string, GraphNode<NMeta>[]>();

  nodes.forEach((node, index) => {
    allPointIndexes.push(index);
    pointIndexByNodeId.set(node.id, index);

    if (node.group) {
      const pointIndexes = pointIndexesByGroup.get(node.group) ?? [];
      pointIndexes.push(index);
      pointIndexesByGroup.set(node.group, pointIndexes);
    }

    if (node.major) {
      majorNodesAll.push(node);
      if (node.group) {
        const majorNodes = majorNodesByGroup.get(node.group) ?? [];
        majorNodes.push(node);
        majorNodesByGroup.set(node.group, majorNodes);
      }
    }
  });

  return { allPointIndexes, pointIndexByNodeId, pointIndexesByGroup, majorNodesAll, majorNodesByGroup };
}

export function getVisiblePointIndexes<NMeta = unknown>(
  nodeIndex: SceneNodeIndex<NMeta>,
  activeGroup: string | null,
): readonly number[] {
  if (activeGroup === null) return nodeIndex.allPointIndexes;
  return nodeIndex.pointIndexesByGroup.get(activeGroup) ?? [];
}

export function writeVisiblePointSizes<NMeta = unknown>(
  targetSizes: Float32Array,
  baseSizes: Float32Array,
  nodeIndex: SceneNodeIndex<NMeta>,
  activeGroup: string | null,
) {
  targetSizes.fill(0);
  const visibleIndexes = getVisiblePointIndexes(nodeIndex, activeGroup);
  for (const pointIndex of visibleIndexes) {
    targetSizes[pointIndex] = baseSizes[pointIndex];
  }
  return visibleIndexes.length;
}

export function selectMajorOverlayNodes<NMeta = unknown>(
  nodeIndex: SceneNodeIndex<NMeta>,
  activeGroup: string | null,
  limitAll = MAJOR_PLANET_LIMIT_ALL,
  limitGroup = MAJOR_PLANET_LIMIT_GROUP,
): GraphNode<NMeta>[] {
  const nodes = activeGroup === null ? nodeIndex.majorNodesAll : (nodeIndex.majorNodesByGroup.get(activeGroup) ?? []);
  return nodes.slice(0, activeGroup === null ? limitAll : limitGroup);
}

export function buildNodeDegrees<NMeta = unknown, EMeta = unknown>(dataset: GraphDataset<NMeta, EMeta>) {
  const degrees = new Map<string, NodeDegree>();
  dataset.nodes.forEach((node) => degrees.set(node.id, { incoming: 0, outgoing: 0, total: 0 }));

  dataset.edges.forEach((edge) => {
    const source = degrees.get(edge.source);
    if (source) {
      source.outgoing += 1;
      source.total += 1;
    }

    const target = degrees.get(edge.target);
    if (target) {
      target.incoming += 1;
      target.total += 1;
    }
  });

  return degrees;
}

export function degreeValue(degree: NodeDegree | undefined, mode: PlanetSizingMode) {
  if (!degree || mode === 'accessor') return 0;
  if (mode === 'incoming') return degree.incoming;
  if (mode === 'outgoing') return degree.outgoing;
  return degree.total;
}

export function maxDegreeForMode<NMeta = unknown>(
  nodes: readonly GraphNode<NMeta>[],
  nodeDegrees: ReadonlyMap<string, NodeDegree>,
  mode: PlanetSizingMode,
  activeGroup: string | null,
) {
  let maxDegree = 0;
  nodes.forEach((node) => {
    if (activeGroup !== null && node.group !== activeGroup) return;
    maxDegree = Math.max(maxDegree, degreeValue(nodeDegrees.get(node.id), mode));
  });
  return maxDegree;
}

export function rankPlanetNodes<NMeta = unknown>(
  nodes: readonly GraphNode<NMeta>[],
  nodeDegrees: ReadonlyMap<string, NodeDegree>,
  mode: PlanetSizingMode,
) {
  let maxDegree = 1;
  nodes.forEach((node) => {
    maxDegree = Math.max(maxDegree, degreeValue(nodeDegrees.get(node.id), mode));
  });

  const majorBonus = maxDegree * MAJOR_PLANET_RANK_BONUS + 1;
  return [...nodes].sort((left, right) => {
    const leftScore = degreeValue(nodeDegrees.get(left.id), mode) + (left.major ? majorBonus : 0);
    const rightScore = degreeValue(nodeDegrees.get(right.id), mode) + (right.major ? majorBonus : 0);
    return rightScore - leftScore || left.id.localeCompare(right.id);
  });
}

export function selectPlanetOverlayNodesBySizing<NMeta = unknown>(
  nodeIndex: SceneNodeIndex<NMeta>,
  nodes: readonly GraphNode<NMeta>[],
  nodeDegrees: ReadonlyMap<string, NodeDegree>,
  mode: PlanetSizingMode,
  activeGroup: string | null,
  limitAll = MAJOR_PLANET_LIMIT_ALL,
  limitGroup = MAJOR_PLANET_LIMIT_GROUP,
  rankedCache?: Map<PlanetSizingMode, GraphNode<NMeta>[]>,
) {
  if (mode === 'accessor') return selectMajorOverlayNodes(nodeIndex, activeGroup, limitAll, limitGroup);

  // Ranking is O(n log n) over every node; reuse a per-mode cache across overlay
  // refreshes when the caller supplies one (the dataset is fixed for the scene's
  // lifetime, so the ranking never changes once computed).
  const cached = rankedCache?.get(mode);
  const ranked = cached ?? rankPlanetNodes(nodes, nodeDegrees, mode);
  if (!cached) rankedCache?.set(mode, ranked);

  const limit = activeGroup === null ? limitAll : Math.min(limitGroup, limitAll);
  return ranked.filter((node) => activeGroup === null || node.group === activeGroup).slice(0, limit);
}

export function planetSizeMultiplierForDegree(
  degree: NodeDegree | undefined,
  planetSizing: ResolvedPlanetSizing,
  maxDegree: number,
) {
  if (planetSizing.mode === 'accessor') return planetSizing.scale;

  const value = degreeValue(degree, planetSizing.mode);
  if (maxDegree <= 0) return planetSizing.min * planetSizing.scale;

  const normalized = Math.log1p(value) / Math.log1p(maxDegree);
  const emphasis = Math.pow(Math.max(0, Math.min(1, normalized)), planetSizing.strength);
  return (planetSizing.min + (planetSizing.max - planetSizing.min) * emphasis) * planetSizing.scale;
}

export function edgeMatchesActiveGroup(
  sourceGroup: string | undefined,
  targetGroup: string | undefined,
  activeGroup: string | null,
) {
  if (activeGroup === null) return true;
  return sourceGroup === activeGroup || targetGroup === activeGroup;
}

export function getSceneRebuildKey<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  layoutKey: string,
) {
  return [
    dataset.generatedAt,
    dataset.nodes.length,
    dataset.edges.length,
    dataset.clusters?.length ?? 0,
    layoutKey,
  ].join(':');
}

export function countRenderablePoints<NMeta = unknown>(nodes: GraphNode<NMeta>[]) {
  return nodes.length;
}

export function getEdgeGroupPair<EMeta = unknown>(
  edge: GraphEdge<EMeta>,
  endpointGroups: Map<string, string | undefined>,
) {
  return {
    sourceGroup: endpointGroups.get(edge.source),
    targetGroup: endpointGroups.get(edge.target),
  };
}
