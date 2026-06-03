import { type CSSProperties } from 'react';
import { formatCompactNumber, getEdgeId } from '../domain/data';
import type { GalaxyCameraView } from './GalaxyScene';
import {
  galaxyGraphThemeCssVariables,
  resolveGalaxyGraphTheme,
  type GalaxyGraphThemeInput,
} from '../engine/rendererConfig';
import type {
  EdgeEndpoint,
  GraphDataset,
  GraphEdge,
  GraphNode,
  ResolvedAccessors,
  SpaceDirection,
  Vec3,
} from '../domain/types';
import type { AsyncDetailState, GalaxyAccessibleSummaryContext, GalaxyGraphLabels } from './galaxyGraphVisualizerTypes';

export const DEFAULT_GALAXY_GRAPH_LABELS: GalaxyGraphLabels = {
  accessibleEdgesHeading: 'Edges',
  accessibleGraphLabel: 'Interactive graph visualization',
  accessibleNodesHeading: 'Nodes',
  accessibleSummaryHeading: 'Graph data summary',
  accessibleSummaryIntro: (stats, shownNodes, shownEdges) =>
    `Showing ${shownNodes} of ${stats.nodes} nodes and ${shownEdges} of ${stats.edges} edges in the current graph view.`,
  alphaBadge: 'ALPHA',
  allGroups: 'All',
  clusterToggle: 'Clusters',
  datasetSize: 'Dataset size',
  edgeId: 'Relationship id',
  edges: 'edges',
  expandNeighbors: 'Expand neighbors',
  expansionFailed: 'Expansion failed',
  focusMatchingNode: 'Focus matching node',
  focusSelection: 'Focus selection',
  formatEdgesCount: (count) => `${formatCompactNumber(count)} ${count === 1 ? 'edge' : 'edges'}`,
  formatGroupsCount: (count) => `${formatCompactNumber(count)} ${count === 1 ? 'group' : 'groups'}`,
  formatMajorCount: (count) => `${formatCompactNumber(count)} major`,
  formatNodesCount: (count) => `${formatCompactNumber(count)} ${count === 1 ? 'node' : 'nodes'}`,
  galaxyMode: 'Galaxy',
  graphControls: 'Graph controls',
  group: 'Group',
  groups: 'groups',
  groupsNav: 'Groups',
  loadMoreBackward: 'Load more backward',
  loadMoreDown: 'Load more down',
  loadMoreForward: 'Load more forward',
  loadMoreGraphData: 'Load more graph data',
  loadMoreLeft: 'Load more left',
  loadMoreRight: 'Load more right',
  loadMoreUp: 'Load more up',
  loading: 'Loading...',
  major: 'major',
  motionOff: 'Paused',
  motionOn: 'Motion on',
  moveBackward: 'Move backward',
  moveDown: 'Move down',
  moveForward: 'Move forward',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  moveUp: 'Move up',
  navigate: 'Navigate',
  nodeId: 'Node id',
  nodeSelectionAnnouncement: (nodeLabel, index, total) => `${nodeLabel} selected, node ${index} of ${total}.`,
  nodes: 'nodes',
  off: 'OFF',
  on: 'ON',
  pauseMotion: 'Pause motion',
  playMotion: 'Play motion',
  relationshipId: 'Relationship id',
  resetCamera: 'Reset camera',
  sceneTools: 'Scene tools',
  searchInput: 'Search nodes',
  searchPlaceholder: 'Search node',
  size: 'Size',
  spaceNavigation: 'Space navigation',
  source: 'Source',
  strength: 'STRENGTH',
  target: 'Target',
  theme: 'Theme',
  to: 'to',
  traceLink: 'Trace link',
  traversalHelp:
    'Use Page Down and Page Up to move between nodes, Home and End to jump to the first or last node, Enter to focus the selected node, and Escape to clear selection.',
};

export const EMPTY_DETAIL_STATE: AsyncDetailState = {
  detail: undefined,
  error: null,
  key: null,
  loading: false,
  reloadToken: 0,
};

export function distinctGroups<NMeta>(nodes: GraphNode<NMeta>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const node of nodes) {
    if (node.group && !seen.has(node.group)) {
      seen.add(node.group);
      out.push(node.group);
    }
  }
  return out;
}

export function findBestMatch<NMeta, EMeta, CMeta>(
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  query: string,
  activeGroup: string | null,
  accessors: ResolvedAccessors<NMeta, EMeta>,
): GraphNode<NMeta> | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  return (
    dataset.nodes.find((node) => {
      if (activeGroup !== null && node.group !== activeGroup) return false;
      const label = nodeDisplayText(node, accessors).toLowerCase();
      const aliases = [node.label, node.name, node.type, node.id].filter(Boolean).join(' ').toLowerCase();
      return label.includes(normalized) || aliases.includes(normalized) || node.id.toLowerCase() === normalized;
    }) ?? null
  );
}

export function nodeDisplayText<NMeta, EMeta>(node: GraphNode<NMeta>, accessors: ResolvedAccessors<NMeta, EMeta>) {
  return accessors.nodeLabel(node) ?? node.label ?? node.name ?? node.type ?? node.id;
}

export function edgeDisplayText<NMeta, EMeta>(edge: GraphEdge<EMeta>, accessors: ResolvedAccessors<NMeta, EMeta>) {
  return accessors.edgeLabel(edge) ?? edge.label ?? edge.name ?? edge.type ?? edge.kind ?? 'relationship';
}

export function findEndpoint<NMeta, EMeta, CMeta>(
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  id: string,
  accessors: ResolvedAccessors<NMeta, EMeta>,
): EdgeEndpoint<NMeta> {
  const node = dataset.nodes.find((entry) => entry.id === id);
  if (node) {
    return { id: node.id, label: nodeDisplayText(node, accessors), group: node.group, isNode: true, node };
  }

  const cluster = (dataset.clusters ?? []).find((entry) => entry.id === id);
  if (cluster) {
    return { id: cluster.id, label: cluster.label, group: cluster.group, isNode: false, node: null };
  }

  return { id, label: id, isNode: false, node: null };
}

export function themeStyle(theme: GalaxyGraphThemeInput | undefined) {
  const resolved = resolveGalaxyGraphTheme(theme);
  return galaxyGraphThemeCssVariables(resolved) as CSSProperties;
}

export function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLAnchorElement
  );
}

export function renderDefaultAccessibleSummary<NMeta, EMeta, CMeta>({
  accessors,
  dataset,
  edges,
  labels,
  nodes,
  stats,
}: GalaxyAccessibleSummaryContext<NMeta, EMeta, CMeta>) {
  const endpointLabel = (id: string) => findEndpoint(dataset, id, accessors).label;

  return (
    <>
      <h2>{labels.accessibleSummaryHeading}</h2>
      <p>{labels.accessibleSummaryIntro(stats, nodes.length, edges.length)}</p>
      <h3>{labels.accessibleNodesHeading}</h3>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}>
            {nodeDisplayText(node, accessors)}
            {node.group ? `, ${labels.group}: ${node.group}` : ''}
          </li>
        ))}
      </ul>
      <h3>{labels.accessibleEdgesHeading}</h3>
      <ul>
        {edges.map((edge, index) => (
          <li key={getEdgeId(edge, index)}>
            {endpointLabel(edge.source)} {labels.to} {endpointLabel(edge.target)}
            {edgeDisplayText(edge, accessors) ? `, ${edgeDisplayText(edge, accessors)}` : ''}
          </li>
        ))}
      </ul>
    </>
  );
}

export function vectorForDirection(view: GalaxyCameraView | null, direction: SpaceDirection): Vec3 | undefined {
  if (!view) return undefined;
  if (direction === 'forward') return view.direction;
  if (direction === 'back') return { x: -view.direction.x, y: -view.direction.y, z: -view.direction.z };
  if (direction === 'right') return view.right;
  if (direction === 'left') return { x: -view.right.x, y: -view.right.y, z: -view.right.z };
  if (direction === 'up') return view.up;
  return { x: -view.up.x, y: -view.up.y, z: -view.up.z };
}
