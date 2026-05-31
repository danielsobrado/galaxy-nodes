import type { ReactNode } from 'react';
import { GitBranch, Radar } from 'lucide-react';
import { formatCompactNumber, getEdgeId } from '../data';
import type { EdgeEndpoint, GraphAccessors, GraphCluster, GraphDataset, GraphEdge, GraphNode, Vec3 } from '../types';

/**
 * Prediction-market preset. This is the original galaxy-nodes flavor, rebuilt on
 * top of the generic engine: a seeded dataset generator, color/size/label
 * accessors, and rich detail-panel renderers. It is purely a consumer of the
 * generic core - nothing here is required to use the library.
 */

export type Category =
  | 'Crypto'
  | 'Politics'
  | 'Geopolitics'
  | 'Finance'
  | 'Tech'
  | 'Sports'
  | 'Culture'
  | 'Social'
  | 'Other';

export type Sentiment = 'yes' | 'no' | 'mixed';

export interface MarketMetrics {
  volume: number;
  activeTraders: number;
  marketPrice: number;
  winRate: number;
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
  'Crypto',
  'Politics',
  'Geopolitics',
  'Finance',
  'Tech',
  'Sports',
  'Culture',
  'Social',
  'Other',
];

export const CATEGORY_COLORS: Record<Category, string> = {
  Crypto: '#46f4bc',
  Politics: '#ff6c86',
  Geopolitics: '#f2f5f1',
  Finance: '#ff9d66',
  Tech: '#6bd7ff',
  Sports: '#a78bfa',
  Culture: '#f5cf5b',
  Social: '#63e6be',
  Other: '#9ca3af',
};

export const DATASET_SIZES = [10_000, 50_000, 75_000, 100_000] as const;
export type DatasetSize = (typeof DATASET_SIZES)[number];

const NODE_TOPICS = [
  'liquidity surge',
  'policy drift',
  'semiconductor supply',
  'rate path',
  'frontier model',
  'energy shock',
  'stablecoin rails',
  'defense corridor',
  'cloud capex',
  'election odds',
  'media reach',
  'derivatives flow',
];

const SENTIMENT_YES_COLOR = '#42f7bd';
const SENTIMENT_NO_COLOR = '#ff6f86';
const SENTIMENT_MIXED_COLOR = '#d7d7d7';

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
    volume: Math.round(randBetween(rand, 1_200_000, 840_000_000)),
    activeTraders: Math.round(randBetween(rand, 40, 18_000)),
    marketPrice: Number(randBetween(rand, 41, 99.8).toFixed(1)),
    winRate: Number(randBetween(rand, 42, 100).toFixed(1)),
  };
}

function sentimentFor(score: number, rand: () => number): Sentiment {
  if (score > 66 && rand() > 0.22) return 'yes';
  if (score < 42 && rand() > 0.24) return 'no';
  return 'mixed';
}

/** Generate a deterministic, seeded galaxy of prediction markets. */
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

  for (let index = 0; index < builds.length - 1; index += 1) {
    edges.push({
      id: `edge-filament-${index}`,
      source: builds[index].cluster.id,
      target: builds[index + 1].cluster.id,
      weight: randBetween(rand, 0.18, 0.92),
      kind: 'filament',
    });
  }

  for (let index = 0; index < majorNodes.length; index += 1) {
    const node = majorNodes[index];
    const target = majorNodes[(index + 1 + Math.floor(rand() * 7)) % majorNodes.length];
    edges.push({
      id: `edge-${index}`,
      source: node.id,
      target: target.id,
      weight: randBetween(rand, 0.35, 1),
      kind: rand() > 0.46 ? 'signal' : 'trade',
    });
  }

  return {
    nodes,
    edges,
    clusters: builds.map((build) => build.cluster),
    generatedAt: new Date().toISOString(),
  };
}

export interface MarketAccessorOptions {
  /** When on, color by sentiment (yes/no) and emphasize high-score markets. */
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
      if (!meta) return CATEGORY_COLORS.Other;
      if (sharpMoney) {
        if (meta.sentiment === 'yes') return SENTIMENT_YES_COLOR;
        if (meta.sentiment === 'no') return SENTIMENT_NO_COLOR;
        return SENTIMENT_MIXED_COLOR;
      }
      return CATEGORY_COLORS[meta.category] ?? CATEGORY_COLORS.Other;
    },
    nodeSize: (node) => {
      const base = node.size ?? 1;
      const boosted = sharpMoney && !node.major && (nodeMeta(node)?.score ?? 0) > 76;
      return base * (boosted ? 1.5 : 1);
    },
    nodeLabel: (node) => {
      const meta = nodeMeta(node);
      return node.major && meta ? `${Math.round(meta.score)}% ${meta.sentiment.toUpperCase()}` : null;
    },
    edgeColor: (edge) => {
      if (edge.kind === 'signal') return SENTIMENT_YES_COLOR;
      if (edge.kind === 'trade') return '#ff9d66';
      return '#aeb8c2';
    },
    edgeWeight: (edge) => edge.weight ?? 0.5,
  };
}

function formatMoney(value: number) {
  return `$${formatCompactNumber(value)}`;
}

/** Rich node detail-panel body for the markets preset. */
export function renderMarketNodeDetail(node: GraphNode<MarketNodeMeta>): ReactNode {
  const meta = nodeMeta(node);
  if (!meta) return null;
  return (
    <>
      <div className="detail-heading">
        <Radar size={18} aria-hidden="true" />
        <div>
          <span>{meta.category}</span>
          <h2>{node.label ?? node.id}</h2>
        </div>
      </div>
      <div className="score-line">
        <strong>{Math.round(meta.score)}%</strong>
        <span>{meta.sentiment.toUpperCase()}</span>
      </div>
      <dl>
        <div>
          <dt>24h volume</dt>
          <dd>{formatMoney(meta.metrics.volume)}</dd>
        </div>
        <div>
          <dt>Active traders</dt>
          <dd>{formatCompactNumber(meta.metrics.activeTraders)}</dd>
        </div>
        <div>
          <dt>Market price</dt>
          <dd>{meta.metrics.marketPrice.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Win rate</dt>
          <dd>{meta.metrics.winRate.toFixed(1)}%</dd>
        </div>
      </dl>
    </>
  );
}

/** Rich edge detail-panel body for the markets preset. */
export function renderMarketEdgeDetail(
  edge: GraphEdge,
  endpoints: { source: EdgeEndpoint<MarketNodeMeta>; target: EdgeEndpoint<MarketNodeMeta> },
): ReactNode {
  const { source, target } = endpoints;
  const sourceVolume = nodeMeta(source.node)?.metrics.volume ?? 8_000_000;
  const targetVolume = nodeMeta(target.node)?.metrics.volume ?? 8_000_000;
  const flow = (sourceVolume + targetVolume) * (edge.weight ?? 0.5) * 0.5;

  return (
    <>
      <div className="detail-heading">
        <GitBranch size={18} aria-hidden="true" />
        <div>
          <span>{edge.kind ?? 'relationship'} relationship</span>
          <h2>
            {source.label} <small>to</small> {target.label}
          </h2>
        </div>
      </div>
      <div className="score-line">
        <strong>{Math.round((edge.weight ?? 0.5) * 100)}%</strong>
        <span>STRENGTH</span>
      </div>
      <dl>
        <div>
          <dt>Relationship id</dt>
          <dd>{getEdgeId(edge)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{source.group ?? '-'}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{target.group ?? '-'}</dd>
        </div>
        <div>
          <dt>Flow estimate</dt>
          <dd>{formatMoney(flow)}</dd>
        </div>
      </dl>
    </>
  );
}
