import {
  CATEGORY_COLORS,
  CATEGORIES,
  type Category,
  type GraphCluster,
  type GraphDataset,
  type GraphEdge,
  type GraphMetrics,
  type GraphNode,
  type Sentiment,
  type Vec3,
} from './types';

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

const CATEGORY_POOL = CATEGORIES.filter(
  (category): category is Exclude<Category, 'All'> => category !== 'All',
);
const CATEGORY_SET = new Set<Exclude<Category, 'All'>>(CATEGORY_POOL);
const EDGE_KIND_SET = new Set<GraphEdge['kind']>(['filament', 'trade', 'signal']);
const SENTIMENT_SET = new Set<Sentiment>(['yes', 'no', 'mixed']);

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

function buildClusters(count: number, rand: () => number): GraphCluster[] {
  const clusterCount = Math.max(14, Math.min(34, Math.round(count / 3_800)));
  const clusters: GraphCluster[] = [];
  const arms = 5;

  for (let index = 0; index < clusterCount; index += 1) {
    const arm = index % arms;
    const armOffset = (arm / arms) * Math.PI * 2;
    const distance = 70 + Math.pow(index / clusterCount, 0.72) * 980;
    const twist = distance * 0.0065;
    const angle = armOffset + twist + randBetween(rand, -0.35, 0.35);
    const y = gaussian(rand) * 42 + Math.sin(angle * 2.2) * 26;
    const category = CATEGORY_POOL[index % CATEGORY_POOL.length];
    const radius = randBetween(rand, 48, 132) * (index < 5 ? 0.75 : 1);

    clusters.push({
      id: `cluster-${index}`,
      label: category.toUpperCase(),
      category,
      center: {
        x: Math.cos(angle) * distance + gaussian(rand) * 38,
        y,
        z: Math.sin(angle) * distance * 0.46 + gaussian(rand) * 52,
      },
      radius,
      nodeCount: 0,
      score: randBetween(rand, 56, 99),
    });
  }

  return clusters;
}

function makeNodeLabel(index: number, category: Exclude<Category, 'All'>, rand: () => number) {
  const suffix = Math.floor(randBetween(rand, 100, 9999)).toString(36).toUpperCase();
  return `${category} ${pick(rand, NODE_TOPICS)} ${suffix}`;
}

function makeMetrics(rand: () => number) {
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

export function generateGalaxyDataset(count: DatasetSize | number = 75_000): GraphDataset {
  const rand = mulberry32(count * 97 + 42);
  const clusters = buildClusters(count, rand);
  const nodes: GraphNode[] = [];
  const majorEvery = Math.max(520, Math.floor(count / 30));

  for (let index = 0; index < count; index += 1) {
    const cluster = clusters[Math.floor(Math.pow(rand(), 1.45) * clusters.length)];
    const isMajor = index % majorEvery === 0 || rand() > 0.9991;
    const localScale = isMajor ? cluster.radius * 0.36 : cluster.radius;
    const x = cluster.center.x + gaussian(rand) * localScale * randBetween(rand, 0.24, 0.95);
    const y = cluster.center.y + gaussian(rand) * localScale * 0.36;
    const z = cluster.center.z + gaussian(rand) * localScale * randBetween(rand, 0.18, 0.72);
    const score = randBetween(rand, 18, 99.5);

    cluster.nodeCount += 1;
    nodes.push({
      id: `node-${index}`,
      label: makeNodeLabel(index, cluster.category, rand),
      category: cluster.category,
      clusterId: cluster.id,
      position: { x, y, z },
      size: isMajor ? randBetween(rand, 17, 42) : randBetween(rand, 1.1, 4.8),
      score,
      sentiment: sentimentFor(score, rand),
      metrics: makeMetrics(rand),
      isMajor,
    });
  }

  const majorNodes = nodes.filter((node) => node.isMajor);
  const edges: GraphEdge[] = [];

  for (let index = 0; index < clusters.length - 1; index += 1) {
    edges.push({
      id: `edge-filament-${index}`,
      source: clusters[index].id,
      target: clusters[index + 1].id,
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
    clusters,
    generatedAt: new Date().toISOString(),
  };
}

export function getNodeColor(
  node: GraphNode,
  sharpMoney: boolean,
  categoryColors?: Partial<Record<GraphNode['category'], string>>,
  sentimentColors?: Partial<Record<'no' | 'yes', string>>,
) {
  if (sharpMoney) {
    if (node.sentiment === 'yes') return sentimentColors?.yes ?? '#42f7bd';
    if (node.sentiment === 'no') return sentimentColors?.no ?? '#ff6f86';
    return '#d7d7d7';
  }

  return categoryColors?.[node.category] ?? CATEGORY_COLORS[node.category];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, path: string) {
  const value = record[key];
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(`${path}.${key} must be a non-empty string.`);
}

function readNumber(record: Record<string, unknown>, key: string, path: string) {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`${path}.${key} must be a finite number.`);
}

function readBoolean(record: Record<string, unknown>, key: string, path: string) {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  throw new Error(`${path}.${key} must be a boolean.`);
}

function readCategory(record: Record<string, unknown>, key: string, path: string): Exclude<Category, 'All'> {
  const value = record[key];
  if (typeof value === 'string' && CATEGORY_SET.has(value as Exclude<Category, 'All'>)) {
    return value as Exclude<Category, 'All'>;
  }

  throw new Error(`${path}.${key} must be one of ${CATEGORY_POOL.join(', ')}.`);
}

function readSentiment(record: Record<string, unknown>, key: string, path: string): Sentiment {
  const value = record[key];
  if (typeof value === 'string' && SENTIMENT_SET.has(value as Sentiment)) return value as Sentiment;
  throw new Error(`${path}.${key} must be one of yes, no, mixed.`);
}

function readEdgeKind(record: Record<string, unknown>, key: string, path: string): GraphEdge['kind'] {
  const value = record[key];
  if (typeof value === 'string' && EDGE_KIND_SET.has(value as GraphEdge['kind'])) return value as GraphEdge['kind'];
  throw new Error(`${path}.${key} must be one of filament, trade, signal.`);
}

function readVec3(value: unknown, path: string): Vec3 {
  if (!isRecord(value)) throw new Error(`${path} must be an object with x, y, and z numbers.`);
  return {
    x: readNumber(value, 'x', path),
    y: readNumber(value, 'y', path),
    z: readNumber(value, 'z', path),
  };
}

function readMetrics(value: unknown, path: string): GraphMetrics {
  if (!isRecord(value)) throw new Error(`${path} must be a metrics object.`);
  return {
    volume: readNumber(value, 'volume', path),
    activeTraders: readNumber(value, 'activeTraders', path),
    marketPrice: readNumber(value, 'marketPrice', path),
    winRate: readNumber(value, 'winRate', path),
  };
}

function parseNode(value: unknown, index: number): GraphNode {
  const path = `nodes[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);

  return {
    id: readString(value, 'id', path),
    label: readString(value, 'label', path),
    category: readCategory(value, 'category', path),
    clusterId: readString(value, 'clusterId', path),
    position: readVec3(value.position, `${path}.position`),
    size: readNumber(value, 'size', path),
    score: readNumber(value, 'score', path),
    sentiment: readSentiment(value, 'sentiment', path),
    metrics: readMetrics(value.metrics, `${path}.metrics`),
    isMajor: readBoolean(value, 'isMajor', path),
  };
}

function parseCluster(value: unknown, index: number): GraphCluster {
  const path = `clusters[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);

  return {
    id: readString(value, 'id', path),
    label: readString(value, 'label', path),
    category: readCategory(value, 'category', path),
    center: readVec3(value.center, `${path}.center`),
    radius: readNumber(value, 'radius', path),
    nodeCount: readNumber(value, 'nodeCount', path),
    score: readNumber(value, 'score', path),
  };
}

function parseEdge(value: unknown, index: number): GraphEdge {
  const path = `edges[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);

  const edge: GraphEdge = {
    source: readString(value, 'source', path),
    target: readString(value, 'target', path),
    weight: readNumber(value, 'weight', path),
    kind: readEdgeKind(value, 'kind', path),
  };

  if (value.id !== undefined) {
    if (typeof value.id !== 'string' || value.id.length === 0) throw new Error(`${path}.id must be a non-empty string when provided.`);
    edge.id = value.id;
  }

  return edge;
}

export function parseGraphDataset(raw: unknown): GraphDataset {
  if (!isRecord(raw)) {
    throw new Error('Dataset must be a JSON object.');
  }

  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges) || !Array.isArray(raw.clusters)) {
    throw new Error('Dataset must include nodes, edges, and clusters arrays.');
  }

  return {
    nodes: raw.nodes.map(parseNode),
    edges: raw.edges.map(parseEdge),
    clusters: raw.clusters.map(parseCluster),
    generatedAt: typeof raw.generatedAt === 'string' && raw.generatedAt.length > 0 ? raw.generatedAt : new Date().toISOString(),
  };
}

export function formatCompactNumber(value: number) {
  return Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function getEdgeId(edge: GraphEdge, index = 0) {
  return edge.id ?? `${edge.kind}:${edge.source}->${edge.target}:${index}`;
}
