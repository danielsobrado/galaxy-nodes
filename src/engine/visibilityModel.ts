import { getEdgeId } from '../domain/data';
import type { ResolvedLayoutCluster } from '../domain/layout';
import type { GraphDataset, GraphEdge, GraphNode, ResolvedAccessors } from '../domain/types';
import type { NodeDegree } from './sceneData';

export type GalaxyViewMode = 'default' | 'expanded' | 'deep' | 'path';

export interface GalaxyVisibilityBudget {
  maxDepth?: number;
  maxEdgesPerNode: number;
  maxLabels: number;
  maxNodesPerCluster?: number;
  maxPrimaryNeighbors?: number;
  maxSecondHopNeighbors?: number;
  maxVisibleClusters?: number;
  maxVisibleEdges: number;
  maxVisibleNodes: number;
}

export interface GalaxyVisibilityBudgets {
  default: GalaxyVisibilityBudget;
  expanded: GalaxyVisibilityBudget;
  deep: GalaxyVisibilityBudget;
}

export interface GalaxyVisibilityOverflowSummary {
  count: number;
  group: string;
  label: string;
}

export interface GalaxyVisibilityOverflow {
  hiddenEdgeCount: number;
  hiddenNodeCount: number;
  summaries: GalaxyVisibilityOverflowSummary[];
}

export interface GalaxyVisibilityProjection {
  labelClusterIds: Set<string>;
  labelNodeIds: Set<string>;
  mode: GalaxyViewMode;
  overflow: GalaxyVisibilityOverflow;
  visibleClusterIds: Set<string>;
  visibleEdgeIds: Set<string>;
  visibleNodeIds: Set<string>;
}

export interface GalaxyNodeImportanceInput<NMeta = unknown> {
  degree: NodeDegree | undefined;
  node: GraphNode<NMeta>;
}

export interface GalaxyEdgeImportanceInput<EMeta = unknown> {
  edge: GraphEdge<EMeta>;
  edgeId: string;
  path: boolean;
  weight: number;
}

export interface GalaxyOverflowGroupInput<NMeta = unknown> {
  node: GraphNode<NMeta>;
}

export interface GalaxyVisibilityModelOptions<NMeta = unknown, EMeta = unknown> {
  budgets?: {
    default?: Partial<GalaxyVisibilityBudget>;
    expanded?: Partial<GalaxyVisibilityBudget>;
    deep?: Partial<GalaxyVisibilityBudget>;
  };
  edgeImportance?: (input: GalaxyEdgeImportanceInput<EMeta>) => number;
  enabled?: boolean;
  nodeImportance?: (input: GalaxyNodeImportanceInput<NMeta>) => number;
  overflowGroup?: (input: GalaxyOverflowGroupInput<NMeta>) => string | null | undefined;
}

export interface GraphVisibilityProjectionInput<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  accessors: ResolvedAccessors<NMeta, EMeta>;
  activeGroup: string | null;
  clusters: readonly ResolvedLayoutCluster<CMeta>[];
  dataset: GraphDataset<NMeta, EMeta, CMeta>;
  focusedClusterId: string | null;
  mode: GalaxyViewMode;
  nodeDegrees: ReadonlyMap<string, NodeDegree>;
  options?: GalaxyVisibilityModelOptions<NMeta, EMeta>;
  pathEdgeIds: ReadonlySet<string>;
  pathNodeIds: ReadonlySet<string>;
  selectedNodeId: string | null;
}

interface EdgeRecord<EMeta = unknown> {
  edge: GraphEdge<EMeta>;
  id: string;
  score: number;
  sourceGroup?: string;
  sourceIsNode: boolean;
  targetGroup?: string;
  targetIsNode: boolean;
}

export const DEFAULT_VISIBILITY_BUDGETS: GalaxyVisibilityBudgets = {
  default: {
    maxEdgesPerNode: 3,
    maxLabels: 40,
    maxNodesPerCluster: 8,
    maxVisibleClusters: 30,
    maxVisibleEdges: 450,
    maxVisibleNodes: 250,
  },
  expanded: {
    maxEdgesPerNode: 8,
    maxLabels: 12,
    maxPrimaryNeighbors: 25,
    maxSecondHopNeighbors: 40,
    maxVisibleEdges: 220,
    maxVisibleNodes: 120,
  },
  deep: {
    maxDepth: 3,
    maxEdgesPerNode: 20,
    maxLabels: 35,
    maxVisibleEdges: 700,
    maxVisibleNodes: 300,
  },
};

function mergeBudget(base: GalaxyVisibilityBudget, override: Partial<GalaxyVisibilityBudget> | undefined) {
  return { ...base, ...override };
}

export function resolveGalaxyVisibilityBudgets<NMeta = unknown, EMeta = unknown>(
  options: GalaxyVisibilityModelOptions<NMeta, EMeta> | undefined,
): GalaxyVisibilityBudgets {
  return {
    default: mergeBudget(DEFAULT_VISIBILITY_BUDGETS.default, options?.budgets?.default),
    expanded: mergeBudget(DEFAULT_VISIBILITY_BUDGETS.expanded, options?.budgets?.expanded),
    deep: mergeBudget(DEFAULT_VISIBILITY_BUDGETS.deep, options?.budgets?.deep),
  };
}

function clampCount(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function addSetItems(target: Set<string>, items: Iterable<string>) {
  for (const item of items) target.add(item);
}

function groupMatches(node: GraphNode, activeGroup: string | null) {
  return activeGroup === null || node.group === activeGroup;
}

function clusterMatches(cluster: ResolvedLayoutCluster, activeGroup: string | null) {
  return activeGroup === null || cluster.group === activeGroup;
}

function defaultNodeScore<NMeta>(
  node: GraphNode<NMeta>,
  degree: NodeDegree | undefined,
  accessors: ResolvedAccessors<NMeta, unknown>,
) {
  return (node.major ? 1_000_000 : 0) + (degree?.total ?? 0) * 1_000 + accessors.nodeSize(node);
}

function nodeScore<NMeta, EMeta>(node: GraphNode<NMeta>, input: GraphVisibilityProjectionInput<NMeta, EMeta>) {
  const degree = input.nodeDegrees.get(node.id);
  const custom = input.options?.nodeImportance?.({ degree, node });
  return finiteOr(
    typeof custom === 'number' ? custom : defaultNodeScore(node, degree, input.accessors as ResolvedAccessors<NMeta>),
    0,
  );
}

function sortNodes<NMeta, EMeta>(nodes: GraphNode<NMeta>[], input: GraphVisibilityProjectionInput<NMeta, EMeta>) {
  return [...nodes].sort((left, right) => {
    const leftScore = nodeScore(left, input);
    const rightScore = nodeScore(right, input);
    return rightScore - leftScore || left.id.localeCompare(right.id);
  });
}

function buildEndpointGroups<NMeta, CMeta>(
  dataset: GraphDataset<NMeta, unknown, CMeta>,
  clusters: readonly ResolvedLayoutCluster<CMeta>[],
) {
  const groups = new Map<string, string | undefined>();
  dataset.nodes.forEach((node) => groups.set(node.id, node.group));
  clusters.forEach((cluster) => groups.set(cluster.id, cluster.group));
  return groups;
}

function buildEdgeRecords<NMeta, EMeta, CMeta>(
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
): EdgeRecord<EMeta>[] {
  const nodeIds = new Set(input.dataset.nodes.map((node) => node.id));
  const endpointGroups = buildEndpointGroups(input.dataset, input.clusters);
  return input.dataset.edges.map((edge, index) => {
    const id = getEdgeId(edge, index);
    const weight = input.accessors.edgeWeight(edge);
    const path = input.pathEdgeIds.has(id);
    const custom = input.options?.edgeImportance?.({ edge, edgeId: id, path, weight });
    const score = finiteOr(typeof custom === 'number' ? custom : weight * 1_000 + (path ? 1_000_000 : 0), 0);
    return {
      edge,
      id,
      score,
      sourceGroup: endpointGroups.get(edge.source),
      sourceIsNode: nodeIds.has(edge.source),
      targetGroup: endpointGroups.get(edge.target),
      targetIsNode: nodeIds.has(edge.target),
    };
  });
}

function sortEdges<EMeta>(edges: EdgeRecord<EMeta>[]) {
  return [...edges].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function edgeTouchesVisibleNode(edge: EdgeRecord, visibleNodeIds: ReadonlySet<string>) {
  return (
    (edge.sourceIsNode && visibleNodeIds.has(edge.edge.source)) ||
    (edge.targetIsNode && visibleNodeIds.has(edge.edge.target))
  );
}

function edgeInsideVisibleNodes(edge: EdgeRecord, visibleNodeIds: ReadonlySet<string>) {
  return (
    edge.sourceIsNode &&
    edge.targetIsNode &&
    visibleNodeIds.has(edge.edge.source) &&
    visibleNodeIds.has(edge.edge.target)
  );
}

function edgeMatchesActiveGroup(edge: EdgeRecord, activeGroup: string | null) {
  return activeGroup === null || edge.sourceGroup === activeGroup || edge.targetGroup === activeGroup;
}

function selectEdges<EMeta>(
  edges: EdgeRecord<EMeta>[],
  budget: GalaxyVisibilityBudget,
  requiredEdgeIds: ReadonlySet<string>,
) {
  const maxEdges = clampCount(budget.maxVisibleEdges, DEFAULT_VISIBILITY_BUDGETS.default.maxVisibleEdges);
  const maxEdgesPerNode = clampCount(budget.maxEdgesPerNode, DEFAULT_VISIBILITY_BUDGETS.default.maxEdgesPerNode);
  const visibleEdgeIds = new Set<string>();
  const edgeCountsByNode = new Map<string, number>();

  function canUseNodeEndpoint(nodeId: string) {
    if (maxEdgesPerNode <= 0) return false;
    return (edgeCountsByNode.get(nodeId) ?? 0) < maxEdgesPerNode;
  }

  function addEdge(edge: EdgeRecord<EMeta>, required = false) {
    if (visibleEdgeIds.has(edge.id)) return true;
    if (visibleEdgeIds.size >= maxEdges && !required) return false;
    if (!required) {
      if (edge.sourceIsNode && !canUseNodeEndpoint(edge.edge.source)) return false;
      if (edge.targetIsNode && !canUseNodeEndpoint(edge.edge.target)) return false;
    }
    visibleEdgeIds.add(edge.id);
    if (edge.sourceIsNode) edgeCountsByNode.set(edge.edge.source, (edgeCountsByNode.get(edge.edge.source) ?? 0) + 1);
    if (edge.targetIsNode) edgeCountsByNode.set(edge.edge.target, (edgeCountsByNode.get(edge.edge.target) ?? 0) + 1);
    return true;
  }

  for (const edge of edges) {
    if (requiredEdgeIds.has(edge.id)) addEdge(edge, true);
  }
  for (const edge of sortEdges(edges)) {
    addEdge(edge);
    if (visibleEdgeIds.size >= maxEdges) break;
  }
  return visibleEdgeIds;
}

function labelProjection<NMeta, EMeta, CMeta>(
  mode: GalaxyViewMode,
  visibleNodeIds: ReadonlySet<string>,
  visibleClusterIds: ReadonlySet<string>,
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
  budget: GalaxyVisibilityBudget,
) {
  const maxLabels = clampCount(budget.maxLabels, DEFAULT_VISIBILITY_BUDGETS.default.maxLabels);
  const labelClusterIds = new Set<string>();
  const labelNodeIds = new Set<string>();
  if (maxLabels <= 0) return { labelClusterIds, labelNodeIds };

  const visibleClusters = input.clusters.filter((cluster) => visibleClusterIds.has(cluster.id));
  const clusterLabelBudget = mode === 'default' ? Math.min(maxLabels, visibleClusters.length) : 0;
  visibleClusters.slice(0, clusterLabelBudget).forEach((cluster) => labelClusterIds.add(cluster.id));

  const remaining = maxLabels - labelClusterIds.size;
  if (remaining <= 0) return { labelClusterIds, labelNodeIds };

  const nodes = sortNodes(
    input.dataset.nodes.filter((node) => visibleNodeIds.has(node.id)),
    input,
  );
  if (input.selectedNodeId && visibleNodeIds.has(input.selectedNodeId)) labelNodeIds.add(input.selectedNodeId);
  for (const node of nodes) {
    if (labelNodeIds.size >= remaining) break;
    labelNodeIds.add(node.id);
  }

  return { labelClusterIds, labelNodeIds };
}

function overflowFor<NMeta, EMeta, CMeta>(
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
  visibleNodeIds: ReadonlySet<string>,
  visibleEdgeIds: ReadonlySet<string>,
  candidateEdgeIds: ReadonlySet<string>,
): GalaxyVisibilityOverflow {
  const scopedNodes = input.dataset.nodes.filter((node) => groupMatches(node, input.activeGroup));
  const hiddenNodes = scopedNodes.filter((node) => !visibleNodeIds.has(node.id));
  const summariesByGroup = new Map<string, number>();
  for (const node of hiddenNodes) {
    const group = input.options?.overflowGroup?.({ node }) ?? node.group ?? 'Other';
    summariesByGroup.set(group, (summariesByGroup.get(group) ?? 0) + 1);
  }
  return {
    hiddenEdgeCount: Math.max(0, candidateEdgeIds.size - visibleEdgeIds.size),
    hiddenNodeCount: hiddenNodes.length,
    summaries: [...summariesByGroup.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, count]) => ({ count, group, label: group })),
  };
}

function finalizeProjection<NMeta, EMeta, CMeta>(
  mode: GalaxyViewMode,
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
  visibleNodeIds: Set<string>,
  visibleEdgeIds: Set<string>,
  visibleClusterIds: Set<string>,
  candidateEdgeIds: Set<string>,
  budget: GalaxyVisibilityBudget,
): GalaxyVisibilityProjection {
  addSetItems(visibleNodeIds, input.pathNodeIds);
  const { labelClusterIds, labelNodeIds } = labelProjection(mode, visibleNodeIds, visibleClusterIds, input, budget);
  return {
    labelClusterIds,
    labelNodeIds,
    mode,
    overflow: overflowFor(input, visibleNodeIds, visibleEdgeIds, candidateEdgeIds),
    visibleClusterIds,
    visibleEdgeIds,
    visibleNodeIds,
  };
}

function allVisibleProjection<NMeta, EMeta, CMeta>(
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
): GalaxyVisibilityProjection {
  const edgeIds = input.dataset.edges.map((edge, index) => getEdgeId(edge, index));
  const visibleNodeIds = new Set(input.dataset.nodes.map((node) => node.id));
  const visibleEdgeIds = new Set(edgeIds);
  const visibleClusterIds = new Set(input.clusters.map((cluster) => cluster.id));
  return {
    labelClusterIds: new Set(),
    labelNodeIds: new Set(),
    mode: input.mode,
    overflow: { hiddenEdgeCount: 0, hiddenNodeCount: 0, summaries: [] },
    visibleClusterIds,
    visibleEdgeIds,
    visibleNodeIds,
  };
}

function projectDefault<NMeta, EMeta, CMeta>(
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
  budget: GalaxyVisibilityBudget,
  edgeRecords: EdgeRecord<EMeta>[],
) {
  const maxClusters = clampCount(
    budget.maxVisibleClusters,
    DEFAULT_VISIBILITY_BUDGETS.default.maxVisibleClusters ?? 30,
  );
  const maxNodes = clampCount(budget.maxVisibleNodes, DEFAULT_VISIBILITY_BUDGETS.default.maxVisibleNodes);
  const maxNodesPerCluster = clampCount(
    budget.maxNodesPerCluster,
    DEFAULT_VISIBILITY_BUDGETS.default.maxNodesPerCluster ?? 8,
  );
  const focusedCluster = input.focusedClusterId
    ? input.clusters.find((cluster) => cluster.id === input.focusedClusterId)
    : null;
  const visibleClusters = focusedCluster
    ? [focusedCluster]
    : [...input.clusters]
        .filter((cluster) => clusterMatches(cluster, input.activeGroup))
        .sort((left, right) => right.nodeCount - left.nodeCount || left.id.localeCompare(right.id))
        .slice(0, maxClusters);
  const visibleClusterIds = new Set(visibleClusters.map((cluster) => cluster.id));
  const visibleNodeIds = new Set<string>();

  for (const cluster of visibleClusters) {
    if (visibleNodeIds.size >= maxNodes) break;
    const nodes = input.dataset.nodes.filter((node) => {
      if (!groupMatches(node, input.activeGroup)) return false;
      if (cluster.group) return node.group === cluster.group;
      return true;
    });
    const limit = Math.min(maxNodesPerCluster, maxNodes - visibleNodeIds.size);
    sortNodes(nodes, input)
      .slice(0, limit)
      .forEach((node) => visibleNodeIds.add(node.id));
  }

  if (!visibleClusters.length) {
    sortNodes(
      input.dataset.nodes.filter((node) => groupMatches(node, input.activeGroup)),
      input,
    )
      .slice(0, maxNodes)
      .forEach((node) => visibleNodeIds.add(node.id));
  }

  const candidateEdges = edgeRecords.filter((edge) => {
    if (!edgeMatchesActiveGroup(edge, input.activeGroup)) return false;
    if (input.pathEdgeIds.has(edge.id)) return true;
    const clusterVisible = visibleClusterIds.has(edge.edge.source) || visibleClusterIds.has(edge.edge.target);
    return clusterVisible || edgeInsideVisibleNodes(edge, visibleNodeIds);
  });
  const visibleEdgeIds = selectEdges(candidateEdges, budget, input.pathEdgeIds);
  return finalizeProjection(
    'default',
    input,
    visibleNodeIds,
    visibleEdgeIds,
    visibleClusterIds,
    new Set(candidateEdges.map((edge) => edge.id)),
    budget,
  );
}

function projectExpanded<NMeta, EMeta, CMeta>(
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
  budget: GalaxyVisibilityBudget,
  edgeRecords: EdgeRecord<EMeta>[],
) {
  if (!input.selectedNodeId)
    return projectDefault(input, resolveGalaxyVisibilityBudgets(input.options).default, edgeRecords);

  const maxNodes = clampCount(budget.maxVisibleNodes, DEFAULT_VISIBILITY_BUDGETS.expanded.maxVisibleNodes);
  const maxPrimary = clampCount(
    budget.maxPrimaryNeighbors,
    DEFAULT_VISIBILITY_BUDGETS.expanded.maxPrimaryNeighbors ?? 25,
  );
  const maxSecond = clampCount(
    budget.maxSecondHopNeighbors,
    DEFAULT_VISIBILITY_BUDGETS.expanded.maxSecondHopNeighbors ?? 40,
  );
  const visibleNodeIds = new Set<string>([input.selectedNodeId]);
  const visibleClusterIds = new Set(
    input.clusters.filter((cluster) => clusterMatches(cluster, input.activeGroup)).map((cluster) => cluster.id),
  );
  const incidentEdges = sortEdges(
    edgeRecords.filter(
      (edge) =>
        edgeMatchesActiveGroup(edge, input.activeGroup) &&
        (edge.edge.source === input.selectedNodeId || edge.edge.target === input.selectedNodeId),
    ),
  );
  const primaryNodeIds: string[] = [];
  for (const edge of incidentEdges) {
    const neighborId = edge.edge.source === input.selectedNodeId ? edge.edge.target : edge.edge.source;
    const neighbor = input.dataset.nodes.find((node) => node.id === neighborId);
    if (!neighbor || visibleNodeIds.has(neighbor.id)) continue;
    primaryNodeIds.push(neighbor.id);
    visibleNodeIds.add(neighbor.id);
    if (primaryNodeIds.length >= maxPrimary || visibleNodeIds.size >= maxNodes) break;
  }

  const secondHopCandidates = new Map<string, GraphNode<NMeta>>();
  for (const primaryNodeId of primaryNodeIds) {
    for (const edge of edgeRecords) {
      if (edge.edge.source !== primaryNodeId && edge.edge.target !== primaryNodeId) continue;
      const secondId = edge.edge.source === primaryNodeId ? edge.edge.target : edge.edge.source;
      if (secondId === input.selectedNodeId || visibleNodeIds.has(secondId)) continue;
      const node = input.dataset.nodes.find((entry) => entry.id === secondId);
      if (node && groupMatches(node, input.activeGroup)) secondHopCandidates.set(node.id, node);
    }
  }
  sortNodes([...secondHopCandidates.values()], input)
    .slice(0, Math.min(maxSecond, Math.max(0, maxNodes - visibleNodeIds.size)))
    .forEach((node) => visibleNodeIds.add(node.id));

  const candidateEdges = edgeRecords.filter((edge) => {
    if (!edgeMatchesActiveGroup(edge, input.activeGroup)) return false;
    return input.pathEdgeIds.has(edge.id) || edgeInsideVisibleNodes(edge, visibleNodeIds);
  });
  const visibleEdgeIds = selectEdges(candidateEdges, budget, input.pathEdgeIds);
  return finalizeProjection(
    'expanded',
    input,
    visibleNodeIds,
    visibleEdgeIds,
    visibleClusterIds,
    new Set(candidateEdges.map((edge) => edge.id)),
    budget,
  );
}

function projectDeep<NMeta, EMeta, CMeta>(
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
  budget: GalaxyVisibilityBudget,
  edgeRecords: EdgeRecord<EMeta>[],
) {
  if (!input.selectedNodeId)
    return projectDefault(input, resolveGalaxyVisibilityBudgets(input.options).default, edgeRecords);

  const maxNodes = clampCount(budget.maxVisibleNodes, DEFAULT_VISIBILITY_BUDGETS.deep.maxVisibleNodes);
  const maxDepth = clampCount(budget.maxDepth, DEFAULT_VISIBILITY_BUDGETS.deep.maxDepth ?? 3);
  const visibleNodeIds = new Set<string>([input.selectedNodeId]);
  const visibleClusterIds = new Set(
    input.clusters.filter((cluster) => clusterMatches(cluster, input.activeGroup)).map((cluster) => cluster.id),
  );
  const queue: Array<{ depth: number; nodeId: string }> = [{ depth: 0, nodeId: input.selectedNodeId }];
  const seen = new Set<string>([input.selectedNodeId]);

  for (let cursor = 0; cursor < queue.length && visibleNodeIds.size < maxNodes; cursor += 1) {
    const current = queue[cursor];
    if (!current || current.depth >= maxDepth) continue;
    const nextEdges = sortEdges(
      edgeRecords.filter(
        (edge) =>
          edgeMatchesActiveGroup(edge, input.activeGroup) &&
          (edge.edge.source === current.nodeId || edge.edge.target === current.nodeId),
      ),
    );
    for (const edge of nextEdges) {
      const nextNodeId = edge.edge.source === current.nodeId ? edge.edge.target : edge.edge.source;
      if (seen.has(nextNodeId)) continue;
      const node = input.dataset.nodes.find((entry) => entry.id === nextNodeId);
      if (!node || !groupMatches(node, input.activeGroup)) continue;
      seen.add(nextNodeId);
      visibleNodeIds.add(nextNodeId);
      queue.push({ depth: current.depth + 1, nodeId: nextNodeId });
      if (visibleNodeIds.size >= maxNodes) break;
    }
  }

  const candidateEdges = edgeRecords.filter((edge) => {
    if (!edgeMatchesActiveGroup(edge, input.activeGroup)) return false;
    return input.pathEdgeIds.has(edge.id) || edgeTouchesVisibleNode(edge, visibleNodeIds);
  });
  const visibleEdgeIds = selectEdges(candidateEdges, budget, input.pathEdgeIds);
  return finalizeProjection(
    'deep',
    input,
    visibleNodeIds,
    visibleEdgeIds,
    visibleClusterIds,
    new Set(candidateEdges.map((edge) => edge.id)),
    budget,
  );
}

function projectPath<NMeta, EMeta, CMeta>(
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
  budgets: GalaxyVisibilityBudgets,
  edgeRecords: EdgeRecord<EMeta>[],
) {
  const expanded = projectExpanded(input, budgets.expanded, edgeRecords);
  addSetItems(expanded.visibleNodeIds, input.pathNodeIds);
  addSetItems(expanded.visibleEdgeIds, input.pathEdgeIds);
  return {
    ...expanded,
    mode: 'path' as const,
    overflow: overflowFor(
      input,
      expanded.visibleNodeIds,
      expanded.visibleEdgeIds,
      new Set(edgeRecords.filter((edge) => edgeMatchesActiveGroup(edge, input.activeGroup)).map((edge) => edge.id)),
    ),
  };
}

export function projectGraphVisibility<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  input: GraphVisibilityProjectionInput<NMeta, EMeta, CMeta>,
): GalaxyVisibilityProjection {
  if (!input.options?.enabled) return allVisibleProjection(input);

  const budgets = resolveGalaxyVisibilityBudgets(input.options);
  const edgeRecords = buildEdgeRecords(input);
  if (input.mode === 'expanded') return projectExpanded(input, budgets.expanded, edgeRecords);
  if (input.mode === 'deep') return projectDeep(input, budgets.deep, edgeRecords);
  if (input.mode === 'path') return projectPath(input, budgets, edgeRecords);
  return projectDefault(input, budgets.default, edgeRecords);
}
