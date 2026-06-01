import { formatCompactNumber } from '../../../../src/domain/data';
import type {
  GraphAccessors,
  GraphCluster,
  GraphDataset,
  GraphEdge,
  GraphNode,
  Vec3,
} from '../../../../src/domain/types';

/**
 * Corporate initiative demo preset, rebuilt on top of the generic engine: a
 * seeded dataset generator, color/size/label accessors, and rich detail-panel
 * renderers. It is purely a consumer of the generic core - nothing here is
 * required to use the library.
 */

export type InitiativeCategory =
  | 'Sales'
  | 'Operations'
  | 'Finance'
  | 'Product'
  | 'Engineering'
  | 'Marketing'
  | 'Customer Success'
  | 'People'
  | 'Risk';

export type InitiativeSentiment = 'on-track' | 'at-risk' | 'watch';

export interface InitiativeMetrics {
  annualImpact: number;
  stakeholders: number;
  confidence: number;
  deliveryRate: number;
}

export interface InitiativeNodeMeta {
  category: InitiativeCategory;
  clusterId: string;
  score: number;
  sentiment: InitiativeSentiment;
  metrics: InitiativeMetrics;
}

export interface InitiativeClusterMeta {
  category: InitiativeCategory;
  nodeCount: number;
  score: number;
}

export type InitiativeNode = GraphNode<InitiativeNodeMeta> & { position: Vec3 };
export type InitiativeCluster = GraphCluster<InitiativeClusterMeta> & {
  center: Vec3;
  group: InitiativeCategory;
  meta: InitiativeClusterMeta;
  radius: number;
};
export type InitiativeDataset = GraphDataset<InitiativeNodeMeta, unknown, InitiativeClusterMeta> & {
  clusters: InitiativeCluster[];
  generatedAt: string;
  nodes: InitiativeNode[];
};

export const INITIATIVE_CATEGORIES: InitiativeCategory[] = [
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

export const CATEGORY_COLORS: Record<InitiativeCategory, string> = {
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

// --- PRNG / math helpers ---
const MULBERRY32_SEED_INCREMENT = 0x6d2b79f5;
const UINT32_NORMALIZER = 4294967296; // 2^32; maps a 32-bit int into [0, 1)
const TAU = Math.PI * 2; // one full revolution in radians

// --- Deterministic dataset seed ---
// The requested node count is mixed into the PRNG seed so each size is reproducible.
const DATASET_SEED_MULTIPLIER = 97;
const DATASET_SEED_OFFSET = 42;

// --- Cluster (spiral-arm) layout ---
const SPIRAL_ARM_COUNT = 5;
const MIN_CLUSTER_COUNT = 14;
const MAX_CLUSTER_COUNT = 34;
const NODES_PER_CLUSTER = 3_800; // ~1 cluster per this many nodes (clamped to the min/max above)
const CLUSTER_INNER_RADIUS = 70; // distance of the innermost cluster from galaxy center
const CLUSTER_RADIAL_SPAN = 980; // extra reach of the outermost cluster
const CLUSTER_RADIAL_EXPONENT = 0.72; // < 1 packs clusters toward the outer disk
const SPIRAL_TWIST_PER_UNIT = 0.0065; // how tightly the arms wind as distance grows
const CLUSTER_ANGLE_SCATTER = 0.35; // +/- random angular offset from the arm centerline
const CLUSTER_Y_THICKNESS = 42; // gaussian vertical thickness of the disk
const DISK_WARP_FREQUENCY = 2.2; // ripple count of the warped disk over one turn
const DISK_WARP_AMPLITUDE = 26; // vertical height of the disk warp
const CLUSTER_RADIUS_MIN = 48;
const CLUSTER_RADIUS_MAX = 132;
const INNER_CLUSTER_COUNT = 5; // first N clusters are shrunk to keep the core tight
const INNER_CLUSTER_RADIUS_SCALE = 0.75;
const CLUSTER_X_SCATTER = 38; // gaussian jitter on a cluster center's x
const CLUSTER_DISK_FLATTEN_Z = 0.46; // flattens cluster centers along z
const CLUSTER_Z_SCATTER = 52; // gaussian jitter on a cluster center's z
const CLUSTER_SCORE_MIN = 56;
const CLUSTER_SCORE_MAX = 99;

// --- Node placement within clusters ---
const MIN_MAJOR_NODE_INTERVAL = 520; // at least one major node per this many nodes...
const NODES_PER_MAJOR_NODE = 30; // ...or roughly one per this many, whichever interval is larger
const CLUSTER_PICK_BIAS_EXPONENT = 1.45; // > 1 biases node assignment toward earlier (larger) clusters
const RANDOM_MAJOR_CHANCE = 0.9991; // rand() above this also promotes a node to major
const MAJOR_NODE_SCALE = 0.36; // major nodes hug their cluster center more tightly
const NODE_X_SPREAD_MIN = 0.24;
const NODE_X_SPREAD_MAX = 0.95;
const NODE_Y_SPREAD = 0.36;
const NODE_Z_SPREAD_MIN = 0.18;
const NODE_Z_SPREAD_MAX = 0.72;
const NODE_SCORE_MIN = 18;
const NODE_SCORE_MAX = 99.5;
const MAJOR_NODE_SIZE_MIN = 17;
const MAJOR_NODE_SIZE_MAX = 42;
const MINOR_NODE_SIZE_MIN = 1.1;
const MINOR_NODE_SIZE_MAX = 4.8;

// --- Labels & metrics ---
const LABEL_SUFFIX_MIN = 100;
const LABEL_SUFFIX_MAX = 9999;
const LABEL_SUFFIX_RADIX = 36; // base-36 so the numeric suffix renders as alphanumeric
const ANNUAL_IMPACT_MIN = 250_000;
const ANNUAL_IMPACT_MAX = 48_000_000;
const STAKEHOLDERS_MIN = 3;
const STAKEHOLDERS_MAX = 220;
const CONFIDENCE_MIN = 41;
const CONFIDENCE_MAX = 99.8;
const DELIVERY_RATE_MIN = 42;
const DELIVERY_RATE_MAX = 100;
const METRIC_DECIMALS = 1;

// --- Sentiment thresholds (score plus a random gate) ---
const ON_TRACK_SCORE = 66;
const ON_TRACK_CHANCE = 0.22; // rand() must exceed this to read as on-track
const AT_RISK_SCORE = 42;
const AT_RISK_CHANCE = 0.24;

// --- Relationship / edge generation ---
const FILAMENT_WEIGHT_MIN = 0.18;
const FILAMENT_WEIGHT_MAX = 0.92;
const SAME_CLUSTER_LINK_CHANCE = 0.58; // probability a related node is drawn from the same cluster
const MAJOR_NODE_LINK_CHANCE = 0.38; // otherwise, probability of linking to a major hub
const RELATIONSHIP_WEIGHT_MIN = 0.22;
const RELATIONSHIP_WEIGHT_MAX = 1;
const MIN_MAJOR_LINKS = 2;
const MAX_EXTRA_MAJOR_LINKS = 7; // each major node gets MIN_MAJOR_LINKS + 0..(this-1) links
const MIN_SAMPLED_RELATIONSHIPS = 800;
const RELATIONSHIP_ATTEMPT_MULTIPLIER = 12; // cap sampling attempts at target * this
// Cumulative probability buckets selecting a relationship kind.
const REL_KIND_DEPENDS_ON = 0.34;
const REL_KIND_SUPPORTS = 0.56;
const REL_KIND_IMPACTS = 0.74;
const REL_KIND_OWNED_BY = 0.88;
const REL_KIND_BLOCKS = 0.96;

// --- Accessors ---
const SCORE_BOOST_THRESHOLD = 76; // non-major nodes above this score render larger in sharpMoney mode
const NODE_SIZE_BOOST = 1.5;
const DEFAULT_NODE_SIZE = 1;
const DEFAULT_EDGE_WEIGHT = 0.5;

function mulberry32(seed: number) {
  return () => {
    let t = (seed += MULBERRY32_SEED_INCREMENT);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_NORMALIZER;
  };
}

function randBetween(rand: () => number, min: number, max: number) {
  return min + (max - min) * rand();
}

function pick<T>(rand: () => number, values: T[]) {
  return values[Math.floor(rand() * values.length)];
}

function gaussian(rand: () => number) {
  // Box-Muller transform: two uniform samples -> one standard-normal sample.
  const u = 1 - rand();
  const v = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

interface ClusterBuild {
  cluster: InitiativeCluster;
  scale: number;
}

function buildClusters(count: number, rand: () => number): ClusterBuild[] {
  const clusterCount = Math.max(MIN_CLUSTER_COUNT, Math.min(MAX_CLUSTER_COUNT, Math.round(count / NODES_PER_CLUSTER)));
  const builds: ClusterBuild[] = [];
  const arms = SPIRAL_ARM_COUNT;

  for (let index = 0; index < clusterCount; index += 1) {
    const arm = index % arms;
    const armOffset = (arm / arms) * TAU;
    const distance =
      CLUSTER_INNER_RADIUS + Math.pow(index / clusterCount, CLUSTER_RADIAL_EXPONENT) * CLUSTER_RADIAL_SPAN;
    const twist = distance * SPIRAL_TWIST_PER_UNIT;
    const angle = armOffset + twist + randBetween(rand, -CLUSTER_ANGLE_SCATTER, CLUSTER_ANGLE_SCATTER);
    const y = gaussian(rand) * CLUSTER_Y_THICKNESS + Math.sin(angle * DISK_WARP_FREQUENCY) * DISK_WARP_AMPLITUDE;
    const category = INITIATIVE_CATEGORIES[index % INITIATIVE_CATEGORIES.length];
    const radius =
      randBetween(rand, CLUSTER_RADIUS_MIN, CLUSTER_RADIUS_MAX) *
      (index < INNER_CLUSTER_COUNT ? INNER_CLUSTER_RADIUS_SCALE : 1);

    builds.push({
      scale: radius,
      cluster: {
        id: `cluster-${index}`,
        label: category.toUpperCase(),
        group: category,
        center: {
          x: Math.cos(angle) * distance + gaussian(rand) * CLUSTER_X_SCATTER,
          y,
          z: Math.sin(angle) * distance * CLUSTER_DISK_FLATTEN_Z + gaussian(rand) * CLUSTER_Z_SCATTER,
        },
        radius,
        meta: {
          category,
          nodeCount: 0,
          score: randBetween(rand, CLUSTER_SCORE_MIN, CLUSTER_SCORE_MAX),
        },
      },
    });
  }

  return builds;
}

function makeNodeLabel(category: InitiativeCategory, rand: () => number) {
  const suffix = Math.floor(randBetween(rand, LABEL_SUFFIX_MIN, LABEL_SUFFIX_MAX))
    .toString(LABEL_SUFFIX_RADIX)
    .toUpperCase();
  return `${category} ${pick(rand, NODE_TOPICS)} ${suffix}`;
}

function makeMetrics(rand: () => number): InitiativeMetrics {
  return {
    annualImpact: Math.round(randBetween(rand, ANNUAL_IMPACT_MIN, ANNUAL_IMPACT_MAX)),
    stakeholders: Math.round(randBetween(rand, STAKEHOLDERS_MIN, STAKEHOLDERS_MAX)),
    confidence: Number(randBetween(rand, CONFIDENCE_MIN, CONFIDENCE_MAX).toFixed(METRIC_DECIMALS)),
    deliveryRate: Number(randBetween(rand, DELIVERY_RATE_MIN, DELIVERY_RATE_MAX).toFixed(METRIC_DECIMALS)),
  };
}

function sentimentFor(score: number, rand: () => number): InitiativeSentiment {
  if (score > ON_TRACK_SCORE && rand() > ON_TRACK_CHANCE) return 'on-track';
  if (score < AT_RISK_SCORE && rand() > AT_RISK_CHANCE) return 'at-risk';
  return 'watch';
}

function relationshipTargetCount(count: number) {
  return Math.min(
    MAX_RELATIONSHIP_EDGES,
    Math.max(MIN_SAMPLED_RELATIONSHIPS, Math.round(count * RELATIONSHIP_EDGE_RATIO)),
  );
}

function relationshipKind(rand: () => number) {
  const roll = rand();
  if (roll < REL_KIND_DEPENDS_ON) return 'depends_on';
  if (roll < REL_KIND_SUPPORTS) return 'supports';
  if (roll < REL_KIND_IMPACTS) return 'impacts';
  if (roll < REL_KIND_OWNED_BY) return 'owned_by';
  if (roll < REL_KIND_BLOCKS) return 'blocks';
  return 'signal';
}

function assertDatasetCount(count: number) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Galaxy initiative dataset size must be a positive integer.');
  }
}

/** Generate a deterministic, seeded galaxy of corporate initiatives. */
export function generateGalaxyDataset(count: DatasetSize | number = 75_000): InitiativeDataset {
  assertDatasetCount(count);
  const rand = mulberry32(count * DATASET_SEED_MULTIPLIER + DATASET_SEED_OFFSET);
  const builds = buildClusters(count, rand);
  const nodes: InitiativeNode[] = [];
  const majorEvery = Math.max(MIN_MAJOR_NODE_INTERVAL, Math.floor(count / NODES_PER_MAJOR_NODE));

  for (let index = 0; index < count; index += 1) {
    const build = builds[Math.floor(Math.pow(rand(), CLUSTER_PICK_BIAS_EXPONENT) * builds.length)];
    const cluster = build.cluster;
    const isMajor = index % majorEvery === 0 || rand() > RANDOM_MAJOR_CHANCE;
    const localScale = isMajor ? build.scale * MAJOR_NODE_SCALE : build.scale;
    const x = cluster.center.x + gaussian(rand) * localScale * randBetween(rand, NODE_X_SPREAD_MIN, NODE_X_SPREAD_MAX);
    const y = cluster.center.y + gaussian(rand) * localScale * NODE_Y_SPREAD;
    const z = cluster.center.z + gaussian(rand) * localScale * randBetween(rand, NODE_Z_SPREAD_MIN, NODE_Z_SPREAD_MAX);
    const score = randBetween(rand, NODE_SCORE_MIN, NODE_SCORE_MAX);

    cluster.meta!.nodeCount += 1;
    nodes.push({
      id: `node-${index}`,
      label: makeNodeLabel(cluster.meta!.category, rand),
      position: { x, y, z },
      size: isMajor
        ? randBetween(rand, MAJOR_NODE_SIZE_MIN, MAJOR_NODE_SIZE_MAX)
        : randBetween(rand, MINOR_NODE_SIZE_MIN, MINOR_NODE_SIZE_MAX),
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
  const nodesByCluster = new Map<string, InitiativeNode[]>();

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
      weight: randBetween(rand, FILAMENT_WEIGHT_MIN, FILAMENT_WEIGHT_MAX),
      kind: 'filament',
    });
  }

  function pickRelatedNode(source: InitiativeNode): InitiativeNode {
    if (rand() < SAME_CLUSTER_LINK_CHANCE) {
      const clusterNodes = nodesByCluster.get(source.meta!.clusterId) ?? nodes;
      return pick(rand, clusterNodes);
    }

    if (rand() < MAJOR_NODE_LINK_CHANCE && majorNodes.length > 0) {
      return pick(rand, majorNodes);
    }

    return pick(rand, nodes);
  }

  function addRelationship(source: InitiativeNode, target: InitiativeNode, prefix: string) {
    if (source.id === target.id) return false;
    const key = `${source.id}->${target.id}`;
    if (relationshipKeys.has(key)) return false;

    relationshipKeys.add(key);
    edges.push({
      id: `edge-${prefix}-${relationshipKeys.size}`,
      source: source.id,
      target: target.id,
      weight: randBetween(rand, RELATIONSHIP_WEIGHT_MIN, RELATIONSHIP_WEIGHT_MAX),
      kind: relationshipKind(rand),
    });
    return true;
  }

  for (let index = 0; index < majorNodes.length; index += 1) {
    const source = majorNodes[index];
    const linkCount = MIN_MAJOR_LINKS + Math.floor(rand() * MAX_EXTRA_MAJOR_LINKS);
    for (let link = 0; link < linkCount; link += 1) {
      addRelationship(source, pickRelatedNode(source), `major-${index}`);
    }
  }

  const targetRelationships = relationshipTargetCount(count);
  let attempts = 0;
  const maxAttempts = targetRelationships * RELATIONSHIP_ATTEMPT_MULTIPLIER;
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

export interface InitiativeAccessorOptions {
  /** When on, color by business status and emphasize high-score initiatives. */
  sharpMoney?: boolean;
}

function nodeMeta(node: GraphNode<InitiativeNodeMeta> | null): InitiativeNodeMeta | undefined {
  return node?.meta;
}

/**
 * Build the color/size/label accessors for the initiatives preset. Memoize the
 * result to avoid redundant buffer refreshes on parent renders. The accessors
 * read the generic `node.meta` payload, so they plug straight into the engine.
 */
export function createInitiativeAccessors(options: InitiativeAccessorOptions = {}): GraphAccessors<InitiativeNodeMeta> {
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
      const base = node.size ?? DEFAULT_NODE_SIZE;
      const boosted = sharpMoney && !node.major && (nodeMeta(node)?.score ?? 0) > SCORE_BOOST_THRESHOLD;
      return base * (boosted ? NODE_SIZE_BOOST : 1);
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
    edgeWeight: (edge) => edge.weight ?? DEFAULT_EDGE_WEIGHT,
  };
}

export function formatInitiativeMoney(value: number) {
  return `$${formatCompactNumber(value)}`;
}
