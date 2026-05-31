import type {
  GraphCluster,
  GraphDataset,
  GraphEdge,
  GraphNode,
  GraphAccessors,
  ResolvedAccessors,
  Vec3,
} from './types';

export type ParsedGraphDataset<NMeta = unknown, EMeta = unknown, CMeta = unknown> = GraphDataset<NMeta, EMeta, CMeta> & {
  clusters: GraphCluster<CMeta>[];
  generatedAt: string;
};

/** Palette used by the default node color accessor to hash groups into colors. */
const DEFAULT_PALETTE = [
  '#6bd7ff',
  '#46f4bc',
  '#ff6c86',
  '#f2f5f1',
  '#ff9d66',
  '#a78bfa',
  '#f5cf5b',
  '#63e6be',
  '#9ca3af',
];
const FALLBACK_NODE_COLOR = '#9ca3af';
const DEFAULT_EDGE_COLOR = '#6bd7ff';
const FILAMENT_EDGE_COLOR = '#aeb8c2';

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function defaultNodeColor(node: GraphNode): string {
  if (node.color) return node.color;
  if (node.group) return DEFAULT_PALETTE[hashString(node.group) % DEFAULT_PALETTE.length];
  return FALLBACK_NODE_COLOR;
}

export function defaultNodeSize(node: GraphNode): number {
  return node.size ?? 1;
}

export function defaultNodeLabel(node: GraphNode): string | null {
  return node.label ?? null;
}

export function defaultEdgeColor(edge: GraphEdge): string {
  if (edge.color) return edge.color;
  return edge.kind === 'filament' ? FILAMENT_EDGE_COLOR : DEFAULT_EDGE_COLOR;
}

export function defaultEdgeWeight(edge: GraphEdge): number {
  return edge.weight ?? 0.5;
}

/** Fill in any missing accessor with the built-in default. */
export function resolveAccessors<NMeta = unknown, EMeta = unknown>(
  accessors?: GraphAccessors<NMeta, EMeta>,
): ResolvedAccessors<NMeta, EMeta> {
  return {
    nodeColor: accessors?.nodeColor ?? (defaultNodeColor as ResolvedAccessors<NMeta, EMeta>['nodeColor']),
    nodeSize: accessors?.nodeSize ?? (defaultNodeSize as ResolvedAccessors<NMeta, EMeta>['nodeSize']),
    nodeLabel: accessors?.nodeLabel ?? (defaultNodeLabel as ResolvedAccessors<NMeta, EMeta>['nodeLabel']),
    edgeColor: accessors?.edgeColor ?? (defaultEdgeColor as ResolvedAccessors<NMeta, EMeta>['edgeColor']),
    edgeWeight: accessors?.edgeWeight ?? (defaultEdgeWeight as ResolvedAccessors<NMeta, EMeta>['edgeWeight']),
  };
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

function readOptionalString(record: Record<string, unknown>, key: string, path: string) {
  if (record[key] === undefined) return undefined;
  return readString(record, key, path);
}

function readOptionalNumber(record: Record<string, unknown>, key: string, path: string) {
  if (record[key] === undefined) return undefined;
  return readNumber(record, key, path);
}

function readOptionalPositiveNumber(record: Record<string, unknown>, key: string, path: string) {
  const value = readOptionalNumber(record, key, path);
  if (value !== undefined && value <= 0) throw new Error(`${path}.${key} must be greater than 0 when provided.`);
  return value;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string, path: string) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  throw new Error(`${path}.${key} must be a boolean when provided.`);
}

function readVec3(value: unknown, path: string): Vec3 {
  if (!isRecord(value)) throw new Error(`${path} must be an object with x, y, and z numbers.`);
  return {
    x: readNumber(value, 'x', path),
    y: readNumber(value, 'y', path),
    z: readNumber(value, 'z', path),
  };
}

function readOptionalVec3(record: Record<string, unknown>, key: string, path: string): Vec3 | undefined {
  if (record[key] === undefined) return undefined;
  return readVec3(record[key], `${path}.${key}`);
}

function parseNode<TMeta = unknown>(value: unknown, index: number): GraphNode<TMeta> {
  const path = `nodes[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);

  const node: GraphNode<TMeta> = {
    id: readString(value, 'id', path),
  };

  const position = readOptionalVec3(value, 'position', path);
  if (position !== undefined) node.position = position;

  const label = readOptionalString(value, 'label', path);
  if (label !== undefined) node.label = label;
  const size = readOptionalNumber(value, 'size', path);
  if (size !== undefined) node.size = size;
  const major = readOptionalBoolean(value, 'major', path);
  if (major !== undefined) node.major = major;
  const group = readOptionalString(value, 'group', path);
  if (group !== undefined) node.group = group;
  const color = readOptionalString(value, 'color', path);
  if (color !== undefined) node.color = color;
  if (value.meta !== undefined) node.meta = value.meta as TMeta;

  return node;
}

function parseEdge<TMeta = unknown>(value: unknown, index: number): GraphEdge<TMeta> {
  const path = `edges[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);

  const edge: GraphEdge<TMeta> = {
    source: readString(value, 'source', path),
    target: readString(value, 'target', path),
  };

  const id = readOptionalString(value, 'id', path);
  if (id !== undefined) edge.id = id;
  const weight = readOptionalNumber(value, 'weight', path);
  if (weight !== undefined) edge.weight = weight;
  const kind = readOptionalString(value, 'kind', path);
  if (kind !== undefined) edge.kind = kind;
  const color = readOptionalString(value, 'color', path);
  if (color !== undefined) edge.color = color;
  if (value.meta !== undefined) edge.meta = value.meta as TMeta;

  return edge;
}

function parseCluster<TMeta = unknown>(value: unknown, index: number): GraphCluster<TMeta> {
  const path = `clusters[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);

  const cluster: GraphCluster<TMeta> = {
    id: readString(value, 'id', path),
    label: readString(value, 'label', path),
  };

  const center = readOptionalVec3(value, 'center', path);
  if (center !== undefined) cluster.center = center;
  const radius = readOptionalPositiveNumber(value, 'radius', path);
  if (radius !== undefined) cluster.radius = radius;
  const group = readOptionalString(value, 'group', path);
  if (group !== undefined) cluster.group = group;
  const color = readOptionalString(value, 'color', path);
  if (color !== undefined) cluster.color = color;
  if (value.meta !== undefined) cluster.meta = value.meta as TMeta;

  return cluster;
}

/**
 * Validate and normalize an untrusted value into a {@link GraphDataset}. Only the
 * structural core is checked; `meta` payloads pass through untouched.
 */
export function parseGraphDataset<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  raw: unknown,
): ParsedGraphDataset<NMeta, EMeta, CMeta> {
  if (!isRecord(raw)) {
    throw new Error('Dataset must be a JSON object.');
  }

  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new Error('Dataset must include nodes and edges arrays.');
  }

  const clusters = raw.clusters ?? [];
  if (!Array.isArray(clusters)) {
    throw new Error('Dataset clusters must be an array when provided.');
  }

  return {
    nodes: raw.nodes.map(parseNode<NMeta>),
    edges: raw.edges.map(parseEdge<EMeta>),
    clusters: clusters.map(parseCluster<CMeta>),
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
  return edge.id ?? `${edge.kind ?? 'edge'}:${edge.source}->${edge.target}:${index}`;
}
