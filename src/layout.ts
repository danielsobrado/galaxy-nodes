import { getEdgeId } from './data';
import type { GraphCluster, GraphDataset, GraphEdge, GraphNode, Vec3 } from './types';

export interface GraphLayoutOptions {
  strategy?: 'galaxy';
  seed?: string | number;
  preserveExistingPositions?: boolean;
  spacing?: number;
  clusterRadius?: number;
}

export type GraphLayoutInput = false | GraphLayoutOptions;

export interface ResolvedLayoutCluster<TMeta = unknown> extends GraphCluster<TMeta> {
  center: Vec3;
  radius: number;
  generated: boolean;
  nodeCount: number;
}

export interface ResolvedGraphLayout<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  nodePositions: Map<string, Vec3>;
  clusters: ResolvedLayoutCluster<CMeta>[];
  clusterLookup: Map<string, ResolvedLayoutCluster<CMeta>>;
  nodeLookup: Map<string, GraphNode<NMeta>>;
  edgeLookup: Map<string, GraphEdge<EMeta>>;
  generated: boolean;
  generatedNodePositions: boolean;
  generatedClusters: boolean;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEFAULT_SPACING = 260;
const DEFAULT_CLUSTER_RADIUS = 92;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hasVec3(value: unknown): value is Vec3 {
  const vec = value as Vec3 | undefined;
  return Boolean(
    vec &&
      typeof vec.x === 'number' &&
      Number.isFinite(vec.x) &&
      typeof vec.y === 'number' &&
      Number.isFinite(vec.y) &&
      typeof vec.z === 'number' &&
      Number.isFinite(vec.z),
  );
}

function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function validateOptionalVec3(value: Vec3 | undefined, path: string) {
  if (value === undefined) return;
  if (!hasVec3(value)) {
    throw new Error(`${path} must include finite x, y, and z numbers when provided.`);
  }
}

function validateOptionalRadius(value: number | undefined, path: string) {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number when provided.`);
  }
}

function seededUnit(seed: string | number | undefined, key: string) {
  return hashString(`${seed ?? 'galaxy-nodes'}:${key}`) / 0xffffffff;
}

function seededSigned(seed: string | number | undefined, key: string) {
  return seededUnit(seed, key) * 2 - 1;
}

function defaultLayoutSeed<NMeta, EMeta, CMeta>(dataset: GraphDataset<NMeta, EMeta, CMeta>) {
  const nodeKey = dataset.nodes.map((node) => node.id).sort((a, b) => a.localeCompare(b)).join('|');
  const edgeKey = dataset.edges
    .map((edge, index) => `${getEdgeId(edge, index)}:${edge.source}->${edge.target}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
  return hashString(`${nodeKey}::${edgeKey}`);
}

function groupLabelForComponent(index: number) {
  return `Component ${index + 1}`;
}

function clusterIdForGroup(group: string) {
  const safe = group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `layout-${safe || hashString(group).toString(36)}`;
}

function connectedComponentLabels<NMeta, EMeta>(nodes: GraphNode<NMeta>[], edges: GraphEdge<EMeta>[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  const labels = new Map<string, string>();
  const seen = new Set<string>();
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  let componentIndex = 0;

  for (const node of sortedNodes) {
    if (seen.has(node.id)) continue;
    const label = groupLabelForComponent(componentIndex);
    componentIndex += 1;
    const queue = [node.id];
    seen.add(node.id);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      labels.set(current, label);
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return labels;
}

function averagePosition(nodes: GraphNode[], positions: Map<string, Vec3>, fallback: Vec3): Vec3 {
  if (!nodes.length) return fallback;
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;

  for (const node of nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    x += position.x;
    y += position.y;
    z += position.z;
    count += 1;
  }

  if (!count) return fallback;
  return { x: x / count, y: y / count, z: z / count };
}

function radiusForNodes(nodes: GraphNode[], positions: Map<string, Vec3>, center: Vec3, fallback: number) {
  let radius = fallback;
  for (const node of nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const dx = position.x - center.x;
    const dy = position.y - center.y;
    const dz = position.z - center.z;
    radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz) + 36);
  }
  return radius;
}

function groupCenter(index: number, count: number, spacing: number, seed: string | number | undefined, key: string): Vec3 {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const angle = index * GOLDEN_ANGLE + seededUnit(seed, `${key}:angle`) * Math.PI * 0.4;
  const distance = spacing * (0.45 + Math.sqrt(index + 1) * 0.78);
  return {
    x: Math.cos(angle) * distance,
    y: seededSigned(seed, `${key}:y`) * spacing * 0.18,
    z: Math.sin(angle) * distance * 0.55,
  };
}

function nodePosition(
  node: GraphNode,
  index: number,
  count: number,
  center: Vec3,
  clusterRadius: number,
  seed: string | number | undefined,
): Vec3 {
  const idHash = seededUnit(seed, `${node.id}:angle`);
  const angle = (index * GOLDEN_ANGLE + idHash * Math.PI * 2) % (Math.PI * 2);
  const radialProgress = count <= 1 ? 0 : Math.sqrt((index + 0.5) / count);
  const radius = clusterRadius * (0.16 + radialProgress * 0.9);
  const jitter = clusterRadius * 0.08;
  return {
    x: center.x + Math.cos(angle) * radius + seededSigned(seed, `${node.id}:jx`) * jitter,
    y: center.y + seededSigned(seed, `${node.id}:jy`) * clusterRadius * 0.28,
    z: center.z + Math.sin(angle) * radius * 0.72 + seededSigned(seed, `${node.id}:jz`) * jitter,
  };
}

function strictResolvedLayout<NMeta, EMeta, CMeta>(
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
): ResolvedGraphLayout<NMeta, EMeta, CMeta> {
  const nodePositions = new Map<string, Vec3>();
  const nodeLookup = new Map<string, GraphNode<NMeta>>();
  const edgeLookup = new Map<string, GraphEdge<EMeta>>();
  const clusters = dataset.clusters ?? [];

  dataset.nodes.forEach((node, index) => {
    validateOptionalVec3(node.position, `nodes[${index}].position`);
    if (!node.position) {
      throw new Error(`Galaxy Nodes layout is disabled, but node "${node.id}" is missing position.`);
    }
    nodePositions.set(node.id, cloneVec3(node.position));
    nodeLookup.set(node.id, node);
  });

  const resolvedClusters: ResolvedLayoutCluster<CMeta>[] = clusters.map((cluster, index) => {
    validateOptionalVec3(cluster.center, `clusters[${index}].center`);
    validateOptionalRadius(cluster.radius, `clusters[${index}].radius`);
    if (!cluster.center) {
      throw new Error(`Galaxy Nodes layout is disabled, but cluster "${cluster.id}" is missing center.`);
    }
    if (cluster.radius === undefined) {
      throw new Error(`Galaxy Nodes layout is disabled, but cluster "${cluster.id}" is missing radius.`);
    }
    return {
      ...cluster,
      center: cloneVec3(cluster.center),
      radius: cluster.radius,
      generated: false,
      nodeCount: dataset.nodes.filter((node) => node.group !== undefined && node.group === cluster.group).length,
    };
  });

  dataset.edges.forEach((edge, index) => edgeLookup.set(getEdgeId(edge, index), edge));

  return {
    nodePositions,
    clusters: resolvedClusters,
    clusterLookup: new Map(resolvedClusters.map((cluster) => [cluster.id, cluster])),
    nodeLookup,
    edgeLookup,
    generated: false,
    generatedClusters: false,
    generatedNodePositions: false,
  };
}

export function resolveGraphLayout<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  options?: GraphLayoutInput,
): ResolvedGraphLayout<NMeta, EMeta, CMeta> {
  if (options === false) return strictResolvedLayout(dataset);

  const config = options ?? {};
  const preserveExistingPositions = config.preserveExistingPositions ?? true;
  const spacing = config.spacing ?? DEFAULT_SPACING;
  const clusterRadius = config.clusterRadius ?? DEFAULT_CLUSTER_RADIUS;
  const seed = config.seed ?? defaultLayoutSeed(dataset);
  const sourceClusters = dataset.clusters ?? [];

  dataset.nodes.forEach((node, index) => validateOptionalVec3(node.position, `nodes[${index}].position`));
  sourceClusters.forEach((cluster, index) => {
    validateOptionalVec3(cluster.center, `clusters[${index}].center`);
    validateOptionalRadius(cluster.radius, `clusters[${index}].radius`);
  });

  const nodeLookup = new Map(dataset.nodes.map((node) => [node.id, node]));
  const edgeLookup = new Map<string, GraphEdge<EMeta>>();
  dataset.edges.forEach((edge, index) => edgeLookup.set(getEdgeId(edge, index), edge));

  const componentLabels = connectedComponentLabels(dataset.nodes, dataset.edges);
  const nodesByGroup = new Map<string, GraphNode<NMeta>[]>();

  for (const node of dataset.nodes) {
    const group = node.group ?? componentLabels.get(node.id) ?? 'Component 1';
    const nodes = nodesByGroup.get(group) ?? [];
    nodes.push(node);
    nodesByGroup.set(group, nodes);
  }

  const groups = [...nodesByGroup.keys()].sort((a, b) => a.localeCompare(b));
  const authoredGroupCenter = new Map<string, Vec3>();
  const authoredGroupCluster = new Set<string>();

  for (const cluster of sourceClusters) {
    if (!cluster.group) continue;
    authoredGroupCluster.add(cluster.group);
    if (preserveExistingPositions && cluster.center) authoredGroupCenter.set(cluster.group, cluster.center);
  }

  const groupCenters = new Map<string, Vec3>();
  groups.forEach((group, index) => {
    groupCenters.set(group, cloneVec3(authoredGroupCenter.get(group) ?? groupCenter(index, groups.length, spacing, seed, group)));
  });

  const nodePositions = new Map<string, Vec3>();
  let generatedNodePositions = false;

  for (const group of groups) {
    const nodes = [...(nodesByGroup.get(group) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const center = groupCenters.get(group) ?? { x: 0, y: 0, z: 0 };
    nodes.forEach((node, index) => {
      if (preserveExistingPositions && node.position) {
        nodePositions.set(node.id, cloneVec3(node.position));
        return;
      }
      generatedNodePositions = true;
      nodePositions.set(node.id, nodePosition(node, index, nodes.length, center, clusterRadius, seed));
    });
  }

  const resolvedClusters: ResolvedLayoutCluster<CMeta>[] = [];
  const usedClusterIds = new Set(sourceClusters.map((cluster) => cluster.id));
  let generatedClusters = false;

  sourceClusters.forEach((cluster, index) => {
    const fallbackCenter = cluster.group
      ? groupCenters.get(cluster.group) ?? groupCenter(index, sourceClusters.length, spacing, seed, cluster.id)
      : groupCenter(groups.length + index, groups.length + sourceClusters.length, spacing, seed, cluster.id);
    const groupNodes = cluster.group ? nodesByGroup.get(cluster.group) ?? [] : [];
    const center = preserveExistingPositions && cluster.center
      ? cloneVec3(cluster.center)
      : averagePosition(groupNodes, nodePositions, fallbackCenter);
    const radius = preserveExistingPositions && cluster.radius !== undefined
      ? cluster.radius
      : radiusForNodes(groupNodes, nodePositions, center, clusterRadius);

    if (!cluster.center || cluster.radius === undefined || !preserveExistingPositions) generatedClusters = true;

    resolvedClusters.push({
      ...cluster,
      center,
      radius,
      generated: !cluster.center || cluster.radius === undefined || !preserveExistingPositions,
      nodeCount: groupNodes.length,
    });
  });

  if (generatedNodePositions) {
    for (const group of groups) {
      if (authoredGroupCluster.has(group)) continue;
      const groupNodes = nodesByGroup.get(group) ?? [];
      const fallbackCenter = groupCenters.get(group) ?? { x: 0, y: 0, z: 0 };
      const center = averagePosition(groupNodes, nodePositions, fallbackCenter);
      const radius = radiusForNodes(groupNodes, nodePositions, center, clusterRadius);
      generatedClusters = true;
      const baseId = clusterIdForGroup(group);
      let id = baseId;
      let suffix = 2;
      while (usedClusterIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedClusterIds.add(id);

      resolvedClusters.push({
        id,
        label: group,
        group: groupNodes.some((node) => node.group === group) ? group : undefined,
        center,
        radius,
        generated: true,
        nodeCount: groupNodes.length,
      } as ResolvedLayoutCluster<CMeta>);
    }
  }

  return {
    nodePositions,
    clusters: resolvedClusters,
    clusterLookup: new Map(resolvedClusters.map((cluster) => [cluster.id, cluster])),
    nodeLookup,
    edgeLookup,
    generated: generatedNodePositions || generatedClusters,
    generatedClusters,
    generatedNodePositions,
  };
}
