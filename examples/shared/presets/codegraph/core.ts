import type { GraphAccessors, GraphEdge, GraphNode } from '../../../../src/domain/types';

export type CodeGraphNodeKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'method'
  | 'property'
  | 'type_alias'
  | 'variable'
  | 'constant'
  | 'import'
  | 'file';

export type CodeGraphEdgeKind = 'calls' | 'contains' | 'references' | 'imports' | 'instantiates';

export interface CodeGraphNodeMeta {
  kind: CodeGraphNodeKind | string;
  qualifiedName: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  signature: string | null;
  isExported: boolean;
  clusterId: string | null;
  degree: number;
}

export interface CodeGraphEdgeMeta {
  kind: CodeGraphEdgeKind | string;
}

export interface CodeGraphClusterMeta {
  filePath: string;
  language: string;
}

const FALLBACK_COLOR = '#9ca3af';
const DEFAULT_NODE_SIZE = 1;
const DEFAULT_EDGE_WEIGHT = 0.5;

export const NODE_KIND_COLORS: Record<string, string> = {
  function: '#6bd7ff',
  class: '#a78bfa',
  interface: '#c4b5fd',
  method: '#63e6be',
  property: '#f472b6',
  type_alias: '#f5cf5b',
  variable: '#aeb8c2',
  constant: '#ff9d66',
  import: '#42f7bd',
  file: '#eef7f4',
};

export const EDGE_KIND_COLORS: Record<string, string> = {
  calls: '#6bd7ff',
  references: '#f5cf5b',
  imports: '#a78bfa',
  instantiates: '#ff9d66',
  contains: '#6b7280',
};

export const GROUP_COLORS: Record<string, string> = {
  src: '#6bd7ff',
  examples: '#42f7bd',
  demo: '#f5cf5b',
  scripts: '#ff9d66',
  docs: '#c4b5fd',
  '.github': '#a78bfa',
  root: '#aeb8c2',
};

export const CODEGRAPH_EDGE_LEGEND: ReadonlyArray<{ label: string; color: string }> = [
  { label: 'calls', color: EDGE_KIND_COLORS.calls },
  { label: 'references', color: EDGE_KIND_COLORS.references },
  { label: 'imports', color: EDGE_KIND_COLORS.imports },
  { label: 'instantiates', color: EDGE_KIND_COLORS.instantiates },
  { label: 'contains', color: EDGE_KIND_COLORS.contains },
];

export const CODEGRAPH_NODE_LEGEND: ReadonlyArray<{ label: string; color: string }> = [
  { label: 'function', color: NODE_KIND_COLORS.function },
  { label: 'class', color: NODE_KIND_COLORS.class },
  { label: 'interface', color: NODE_KIND_COLORS.interface },
  { label: 'file', color: NODE_KIND_COLORS.file },
];

function nodeMeta(node: GraphNode<CodeGraphNodeMeta>): CodeGraphNodeMeta | undefined {
  return node.meta;
}

export function createCodeGraphAccessors(): GraphAccessors<CodeGraphNodeMeta, CodeGraphEdgeMeta> {
  return {
    nodeColor: (node) => {
      const meta = nodeMeta(node);
      if (!meta) return FALLBACK_COLOR;
      return NODE_KIND_COLORS[meta.kind] ?? GROUP_COLORS[node.group ?? ''] ?? FALLBACK_COLOR;
    },
    nodeSize: (node) => node.size ?? DEFAULT_NODE_SIZE,
    nodeLabel: (node) => {
      const meta = nodeMeta(node);
      if (!node.major || !meta) return null;
      return meta.kind === 'file' ? meta.filePath : meta.qualifiedName;
    },
    edgeColor: (edge) => EDGE_KIND_COLORS[edge.kind ?? ''] ?? FALLBACK_COLOR,
    edgeWeight: (edge) => edge.weight ?? DEFAULT_EDGE_WEIGHT,
  };
}

export function formatCodeGraphKind(kind: string | undefined) {
  return (kind ?? 'unknown').replaceAll('_', ' ');
}

export function codegraphGroupsFromDataset(nodes: GraphNode<CodeGraphNodeMeta>[]): string[] {
  const groups = new Set<string>();
  for (const node of nodes) {
    if (node.group) groups.add(node.group);
  }
  return [...groups].sort((a, b) => a.localeCompare(b));
}

export function isCodeGraphEdge(edge: GraphEdge): edge is GraphEdge<CodeGraphEdgeMeta> {
  return typeof edge.kind === 'string';
}
