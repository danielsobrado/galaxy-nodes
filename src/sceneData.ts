import type { GraphDataset, GraphEdge, GraphNode } from './types';

export const MAJOR_PLANET_LIMIT_ALL = 96;
export const MAJOR_PLANET_LIMIT_GROUP = 48;

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
  const nodes = activeGroup === null ? nodeIndex.majorNodesAll : nodeIndex.majorNodesByGroup.get(activeGroup) ?? [];
  return nodes.slice(0, activeGroup === null ? limitAll : limitGroup);
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
