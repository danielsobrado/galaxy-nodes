import { formatCompactNumber } from '../data';
import type { GraphAccessors, GraphCluster, GraphDataset, GraphEdge, GraphNode, Vec3 } from '../types';

/**
 * Corporate demo preset, rebuilt on top of the generic engine: a seeded dataset
 * generator, color/size/label accessors, and rich detail-panel renderers. It is
 * purely a consumer of the generic core - nothing here is required to use the
 * library.
 */

export type Category =
  | 'Sales'
  | 'Operations'
  | 'Finance'
  | 'Product'
  | 'Engineering'
  | 'Marketing'
  | 'Customer Success'
  | 'People'
  | 'Risk';

export type Sentiment = 'on-track' | 'at-risk' | 'watch';

export interface MarketMetrics {
  annualImpact: number;
  stakeholders: number;
  confidence: number;
  deliveryRate: number;
}

export interface MarketNodeMeta {
  category: Category;
  clusterId: string;
  score: number;
  sentiment: Sentiment;
  metrics: MarketMetrics;
}

export interface MarketClusterMeta {
  category: Category;
  nodeCount: number;
  score: number;
}

export type MarketNode = GraphNode<MarketNodeMeta> & { position: Vec3 };
export type MarketCluster = GraphCluster<MarketClusterMeta> & {
  center: Vec3;
  group: Category;
  meta: MarketClusterMeta;
  radius: number;
};
export type MarketDataset = GraphDataset<MarketNodeMeta, unknown, MarketClusterMeta> & {
  clusters: MarketCluster[];
  generatedAt: string;
  nodes: MarketNode[];
};

export const MARKET_CATEGORIES: Category[] = [
  'Sales',
  'Operations',
  'Finance',
  'Product',
  'Engineering',
  'Marketing',
  'Customer Success',
  'People',
  'Risk',
];

export const CATEGORY_COLORS: Record<Category, string> = {
  Sales: '#42f7bd',
  Operations: '#f5cf5b',
  Finance: '#ff9d66',
  Product: '#6bd7ff',
  Engineering: '#a78bfa',
  Marketing: '#ff6c86',
  'Customer Success': '#63e6be',
  People: '#f472b6',
  Risk: '#c4b5fd',
};

export const DATASET_SIZES = [10_000, 50_000, 75_000, 100_000] as const;
export type DatasetSize = (typeof DATASET_SIZES)[number];

const NODE_TOPICS = [
  'enterprise renewal',
  'regional forecast',
  'customer onboarding',
  'supply continuity',
  'margin recovery',
  'product launch',
  'platform reliability',
  'talent capacity',
  'compliance review',
  'vendor consolidation',
  'pipeline coverage',
  'service expansion',
];

const SENTIMENT_YES_COLOR = '#42f7bd';
const SENTIMENT_NO_COLOR = '#ff6f86';
const SENTIMENT_MIXED_COLOR = '#d7d7d7';
const FALLBACK_CATEGORY_COLOR = '#9ca3af';
const MAX_RELATIONSHIP_EDGES = 12_000;
const RELATIONSHIP_EDGE_RATIO = 0.16;

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randBetween(rand: () => number, min: number, max: number) {
  return min + (max - min) * rand();
}

function pick<T>(rand: () => number, values: T[]) {
  return values[Math.floor(rand() * values.length)];
}

function gaussian(rand: () => number) {
  const u = 1 - rand();
  const v = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface ClusterBuild {
  cluster: MarketCluster;
  scale: number;
}

function buildClusters(count: number, rand: () => number): ClusterBuild[] {
  const clusterCount = Math.max(14, Math.min(34, Math.round(count / 3_800)));
  const builds: ClusterBuild[] = [];
  const arms = 5;

  for (let index = 0; index < clusterCount; index += 1) {
    const arm = index % arms;
    const armOffset = (arm / arms) * Math.PI * 2;
    const distance = 70 + Math.pow(index / clusterCount, 0.72) * 980;
    const twist = distance * 0.0065;
    const angle = armOffset + twist + randBetween(rand, -0.35, 0.35);
    const y = gaussian(rand) * 42 + Math.sin(angle * 2.2) * 26;
    const category = MARKET_CATEGORIES[index % MARKET_CATEGORIES.length];
    const radius = randBetween(rand, 48, 132) * (index < 5 ? 0.75 : 1);

    builds.push({
      scale: radius,
      cluster: {
        id: `cluster-${index}`,
        label: category.toUpperCase(),
        group: category,
        center: {
          x: Math.cos(angle) * distance + gaussian(rand) * 38,
          y,
          z: Math.sin(angle) * distance * 0.46 + gaussian(rand) * 52,
        },
        radius,
        meta: {
          category,
          nodeCount: 0,
          score: randBetween(rand, 56, 99),
        },
      },
    });
  }

  return builds;
}

function makeNodeLabel(category: Category, rand: () => number) {
  const suffix = Math.floor(randBetween(rand, 100, 9999))
    .toString(36)
    .toUpperCase();
  return `${category} ${pick(rand, NODE_TOPICS)} ${suffix}`;
}

function makeMetrics(rand: () => number): MarketMetrics {
  return {
    annualImpact: Math.round(randBetween(rand, 250_000, 48_000_000)),
    stakeholders: Math.round(randBetween(rand, 3, 220)),
    confidence: Number(randBetween(rand, 41, 99.8).toFixed(1)),
    deliveryRate: Number(randBetween(rand, 42, 100).toFixed(1)),
  };
}

function sentimentFor(score: number, rand: () => number): Sentiment {
  if (score > 66 && rand() > 0.22) return 'on-track';
  if (score < 42 && rand() > 0.24) return 'at-risk';
  return 'watch';
}

function relationshipTargetCount(count: number) {
  return Math.min(MAX_RELATIONSHIP_EDGES, Math.max(800, Math.round(count * RELATIONSHIP_EDGE_RATIO)));
}

function relationshipKind(rand: () => number) {
  const roll = rand();
  if (roll < 0.34) return 'depends_on';
  if (roll < 0.56) return 'supports';
  if (roll < 0.74) return 'impacts';
  if (roll < 0.88) return 'owned_by';
  if (roll < 0.96) return 'blocks';
  return 'signal';
}

/** Generate a deterministic, seeded galaxy of corporate initiatives. */
export function generateGalaxyDataset(count: DatasetSize | number = 75_000): MarketDataset {
  const rand = mulberry32(count * 97 + 42);
  const builds = buildClusters(count, rand);
  const nodes: MarketNode[] = [];
  const majorEvery = Math.max(520, Math.floor(count / 30));

  for (let index = 0; index < count; index += 1) {
    const build = builds[Math.floor(Math.pow(rand(), 1.45) * builds.length)];
    const cluster = build.cluster;
    const isMajor = index % majorEvery === 0 || rand() > 0.9991;
    const localScale = isMajor ? build.scale * 0.36 : build.scale;
    const x = cluster.center.x + gaussian(rand) * localScale * randBetween(rand, 0.24, 0.95);
    const y = cluster.center.y + gaussian(rand) * localScale * 0.36;
    const z = cluster.center.z + gaussian(rand) * localScale * randBetween(rand, 0.18, 0.72);
    const score = randBetween(rand, 18, 99.5);

    cluster.meta!.nodeCount += 1;
    nodes.push({
      id: `node-${index}`,
      label: makeNodeLabel(cluster.meta!.category, rand),
      position: { x, y, z },
      size: isMajor ? randBetween(rand, 17, 42) : randBetween(rand, 1.1, 4.8),
      major: isMajor,
      group: cluster.meta!.category,
      meta: {
        category: cluster.meta!.category,
        clusterId: cluster.id,
        score,
        sentiment: sentimentFor(score, rand),
        metrics: makeMetrics(rand),
      },
    });
  }

  const majorNodes = nodes.filter((node) => node.major);
  const edges: GraphEdge[] = [];
  const relationshipKeys = new Set<string>();
  const nodesByCluster = new Map<string, MarketNode[]>();

  for (const node of nodes) {
    const clusterNodes = nodesByCluster.get(node.meta!.clusterId) ?? [];
    clusterNodes.push(node);
    nodesByCluster.set(node.meta!.clusterId, clusterNodes);
  }

  for (let index = 0; index < builds.length - 1; index += 1) {
    edges.push({
      id: `edge-filament-${index}`,
      source: builds[index].cluster.id,
      target: builds[index + 1].cluster.id,
      weight: randBetween(rand, 0.18, 0.92),
      kind: 'filament',
    });
  }

  function pickRelatedNode(source: MarketNode): MarketNode {
    if (rand() < 0.58) {
      const clusterNodes = nodesByCluster.get(source.meta!.clusterId) ?? nodes;
      return pick(rand, clusterNodes);
    }

    if (rand() < 0.38 && majorNodes.length > 0) {
      return pick(rand, majorNodes);
    }

    return pick(rand, nodes);
  }

  function addRelationship(source: MarketNode, target: MarketNode, prefix: string) {
    if (source.id === target.id) return false;
    const key = `${source.id}->${target.id}`;
    if (relationshipKeys.has(key)) return false;

    relationshipKeys.add(key);
    edges.push({
      id: `edge-${prefix}-${relationshipKeys.size}`,
      source: source.id,
      target: target.id,
      weight: randBetween(rand, 0.22, 1),
      kind: relationshipKind(rand),
    });
    return true;
  }

  for (let index = 0; index < majorNodes.length; index += 1) {
    const source = majorNodes[index];
    const linkCount = 2 + Math.floor(rand() * 7);
    for (let link = 0; link < linkCount; link += 1) {
      addRelationship(source, pickRelatedNode(source), `major-${index}`);
    }
  }

  const targetRelationships = relationshipTargetCount(count);
  let attempts = 0;
  const maxAttempts = targetRelationships * 12;
  while (relationshipKeys.size < targetRelationships && attempts < maxAttempts) {
    attempts += 1;
    const source = pick(rand, nodes);
    addRelationship(source, pickRelatedNode(source), 'sample');
  }

  return {
    nodes,
    edges,
    clusters: builds.map((build) => build.cluster),
    generatedAt: new Date().toISOString(),
  };
}

export interface MarketAccessorOptions {
  /** When on, color by business status and emphasize high-score initiatives. */
  sharpMoney?: boolean;
}

function nodeMeta(node: GraphNode<MarketNodeMeta> | null): MarketNodeMeta | undefined {
  return node?.meta;
}

/**
 * Build the color/size/label accessors for the markets preset. Memoize the
 * result to avoid redundant buffer refreshes on parent renders. The accessors
 * read the generic `node.meta` payload, so they plug straight into the engine.
 */
export function createMarketAccessors(options: MarketAccessorOptions = {}): GraphAccessors<MarketNodeMeta> {
  const sharpMoney = options.sharpMoney ?? true;

  return {
    nodeColor: (node) => {
      const meta = nodeMeta(node);
      if (!meta) return FALLBACK_CATEGORY_COLOR;
      if (sharpMoney) {
        if (meta.sentiment === 'on-track') return SENTIMENT_YES_COLOR;
        if (meta.sentiment === 'at-risk') return SENTIMENT_NO_COLOR;
        return SENTIMENT_MIXED_COLOR;
      }
      return CATEGORY_COLORS[meta.category] ?? FALLBACK_CATEGORY_COLOR;
    },
    nodeSize: (node) => {
      const base = node.size ?? 1;
      const boosted = sharpMoney && !node.major && (nodeMeta(node)?.score ?? 0) > 76;
      return base * (boosted ? 1.5 : 1);
    },
    nodeLabel: (node) => {
      const meta = nodeMeta(node);
      return node.major && meta ? `${Math.round(meta.score)}% ${meta.sentiment.replace('-', ' ').toUpperCase()}` : null;
    },
    edgeColor: (edge) => {
      if (edge.kind === 'signal') return SENTIMENT_YES_COLOR;
      if (edge.kind === 'depends_on') return '#ff9d66';
      if (edge.kind === 'blocks') return SENTIMENT_NO_COLOR;
      if (edge.kind === 'supports') return '#6bd7ff';
      if (edge.kind === 'impacts') return '#f5cf5b';
      if (edge.kind === 'owned_by') return '#a78bfa';
      return '#aeb8c2';
    },
    edgeWeight: (edge) => edge.weight ?? 0.5,
  };
}

export function formatMarketMoney(value: number) {
  return `$${formatCompactNumber(value)}`;
}
