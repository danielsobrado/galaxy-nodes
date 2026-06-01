import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Focus,
  GitBranch,
  Layers3,
  Navigation,
  Pause,
  Play,
  Radar,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import GalaxyScene, {
  type CameraCommand,
  type GalaxyGraphTheme,
  type GalaxyMotionPreference,
  type GalaxyPlanetSizingOptions,
  type GalaxySceneFailure,
  type GalaxySceneProps,
} from './GalaxyScene';
import { DEFAULT_GRAPH_EDGE_BUDGET, formatCompactNumber, getEdgeId, mergeGraphDataset, resolveAccessors } from './data';
import type { GraphLayoutInput } from './layout';
import type {
  EdgeEndpoint,
  GalaxyCameraView,
  GraphAccessors,
  GraphDataset,
  GraphDatasetPatch,
  GraphEdge,
  GraphNode,
  ResolvedAccessors,
  SpaceDirection,
  Vec3,
} from './types';

export interface GraphStats {
  nodes: number;
  groups: number;
  edges: number;
  major: number;
}

export interface GalaxyGraphVisualizerOptions {
  accessibleSummaryLimit?: number;
  datasetSizes?: readonly number[];
  galaxyMode?: boolean;
  motionPreference?: GalaxyMotionPreference;
  planetSizing?: GalaxyPlanetSizingOptions;
  showClusters?: boolean;
  showControls?: boolean;
  showDatasetSizeControls?: boolean;
  showDetailPanel?: boolean;
  showGroupNav?: boolean;
  showLegend?: boolean;
  showNavigationControls?: boolean;
  showSearch?: boolean;
  showStats?: boolean;
  showTimeline?: boolean;
  webglContextLimit?: number;
}

export interface GalaxyGraphLabels {
  accessibleEdgesHeading: string;
  accessibleGraphLabel: string;
  accessibleNodesHeading: string;
  accessibleSummaryHeading: string;
  accessibleSummaryIntro: (stats: GraphStats, shownNodes: number, shownEdges: number) => string;
  alphaBadge: string;
  allGroups: string;
  clusterToggle: string;
  datasetSize: string;
  edgeId: string;
  edges: string;
  expandNeighbors: string;
  expansionFailed: string;
  focusMatchingNode: string;
  focusSelection: string;
  formatEdgesCount: (count: number) => string;
  formatGroupsCount: (count: number) => string;
  formatMajorCount: (count: number) => string;
  formatNodesCount: (count: number) => string;
  galaxyMode: string;
  graphControls: string;
  group: string;
  groups: string;
  groupsNav: string;
  loadMoreBackward: string;
  loadMoreDown: string;
  loadMoreForward: string;
  loadMoreGraphData: string;
  loadMoreLeft: string;
  loadMoreRight: string;
  loadMoreUp: string;
  loading: string;
  major: string;
  motionOff: string;
  motionOn: string;
  moveBackward: string;
  moveDown: string;
  moveForward: string;
  moveLeft: string;
  moveRight: string;
  moveUp: string;
  navigate: string;
  nodeId: string;
  nodeSelectionAnnouncement: (nodeLabel: string, index: number, total: number) => string;
  nodes: string;
  off: string;
  on: string;
  pauseMotion: string;
  playMotion: string;
  relationshipId: string;
  resetCamera: string;
  sceneTools: string;
  searchInput: string;
  searchPlaceholder: string;
  size: string;
  spaceNavigation: string;
  source: string;
  strength: string;
  target: string;
  to: string;
  traceLink: string;
  traversalHelp: string;
}

export interface GalaxyAccessibleSummaryContext<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  accessors: ResolvedAccessors<NMeta, EMeta>;
  activeGroup: string | null;
  dataset: GraphDataset<NMeta, EMeta, CMeta>;
  edges: readonly GraphEdge<EMeta>[];
  labels: GalaxyGraphLabels;
  nodes: readonly GraphNode<NMeta>[];
  stats: GraphStats;
}

const DEFAULT_GALAXY_GRAPH_LABELS: GalaxyGraphLabels = {
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
  to: 'to',
  traceLink: 'Trace link',
  traversalHelp:
    'Use Page Down and Page Up to move between nodes, Home and End to jump to the first or last node, Enter to focus the selected node, and Escape to clear selection.',
};

export interface LargeGraphDetailContext {
  detail: unknown;
  error: unknown;
  expand: () => void;
  loading: boolean;
  reload: () => void;
}

export interface LargeGraphExpandRequest {
  activeGroup: string | null;
  camera?: GalaxyCameraView;
  direction?: SpaceDirection;
  directionVector?: Vec3;
  loadedEdgeIds: string[];
  loadedNodeIds: string[];
  nodeId?: string;
  type: 'direction' | 'node';
}

export interface LargeGraphOptions<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  edgeBudget?: number;
  enabled?: boolean;
  expandGraph?: (
    request: LargeGraphExpandRequest,
    signal: AbortSignal,
  ) => Promise<GraphDatasetPatch<NMeta, EMeta, CMeta>>;
  loadEdgeDetail?: (
    edge: GraphEdge<EMeta>,
    endpoints: { source: EdgeEndpoint<NMeta>; target: EdgeEndpoint<NMeta> },
    signal: AbortSignal,
  ) => Promise<unknown>;
  loadNodeDetail?: (node: GraphNode<NMeta>, signal: AbortSignal) => Promise<unknown>;
}

export interface GalaxyGraphVisualizerProps<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  /** Visual accessors. Memoize to avoid unnecessary buffer refreshes on parent renders. */
  accessors?: GraphAccessors<NMeta, EMeta>;
  brandLabel?: string;
  className?: string;
  /** Extra toggles rendered in the control ribbon (e.g. domain-specific modes). */
  controlActions?: ReactNode;
  dataset: GraphDataset<NMeta, EMeta, CMeta>;
  /** Group filter buttons. Defaults to the distinct `node.group` values. */
  groups?: readonly string[];
  initialGroup?: string | null;
  /** Replaces the legend strip; nothing renders without it. */
  legend?: ReactNode;
  /** Optional built-in spatial layout. Omit for auto, pass false to require authored coordinates. */
  layout?: GraphLayoutInput;
  /** Localized labels for built-in chrome and the non-visual graph summary. */
  labels?: Partial<GalaxyGraphLabels>;
  largeGraph?: LargeGraphOptions<NMeta, EMeta, CMeta>;
  /** Called when a dataset-size button is pressed; supply a new dataset. */
  onDatasetSizeChange?: (size: number) => void;
  onGroupChange?: (group: string | null) => void;
  onHoverEdge?: (edge: GraphEdge<EMeta> | null) => void;
  onHoverNode?: (node: GraphNode<NMeta> | null) => void;
  onContextBudgetExceeded?: GalaxySceneProps<NMeta, EMeta, CMeta>['onContextBudgetExceeded'];
  onNavigate?: (command: CameraCommand) => void;
  onSceneFailure?: (failure: GalaxySceneFailure) => void;
  onSelectEdge?: (edge: GraphEdge<EMeta> | null) => void;
  onSelectNode?: (node: GraphNode<NMeta> | null) => void;
  options?: GalaxyGraphVisualizerOptions;
  renderEdgeDetail?: (
    edge: GraphEdge<EMeta>,
    endpoints: { source: EdgeEndpoint<NMeta>; target: EdgeEndpoint<NMeta> },
    context?: LargeGraphDetailContext,
  ) => ReactNode;
  renderAccessibleSummary?: (context: GalaxyAccessibleSummaryContext<NMeta, EMeta, CMeta>) => ReactNode;
  renderNodeDetail?: (node: GraphNode<NMeta>, context?: LargeGraphDetailContext) => ReactNode;
  renderStats?: (stats: GraphStats) => ReactNode;
  selectedEdgeId?: string | null;
  selectedNodeId?: string | null;
  sideRailActions?: ReactNode;
  theme?: GalaxyGraphTheme;
}

function distinctGroups<NMeta>(nodes: GraphNode<NMeta>[]): string[] {
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

function findBestMatch<NMeta, EMeta, CMeta>(
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

function nodeDisplayText<NMeta, EMeta>(node: GraphNode<NMeta>, accessors: ResolvedAccessors<NMeta, EMeta>) {
  return accessors.nodeLabel(node) ?? node.label ?? node.name ?? node.type ?? node.id;
}

function edgeDisplayText<NMeta, EMeta>(edge: GraphEdge<EMeta>, accessors: ResolvedAccessors<NMeta, EMeta>) {
  return accessors.edgeLabel(edge) ?? edge.label ?? edge.name ?? edge.type ?? edge.kind ?? 'relationship';
}

function findEndpoint<NMeta, EMeta, CMeta>(
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

function themeStyle(theme: GalaxyGraphTheme | undefined) {
  return {
    '--gn-bg': theme?.background,
    '--gn-panel-accent': theme?.panelAccentColor,
    '--gn-selected': theme?.selectedColor,
  } as CSSProperties;
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLAnchorElement
  );
}

function renderDefaultAccessibleSummary<NMeta, EMeta, CMeta>({
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

function vectorForDirection(view: GalaxyCameraView | null, direction: SpaceDirection): Vec3 | undefined {
  if (!view) return undefined;
  if (direction === 'forward') return view.direction;
  if (direction === 'back') return { x: -view.direction.x, y: -view.direction.y, z: -view.direction.z };
  if (direction === 'right') return view.right;
  if (direction === 'left') return { x: -view.right.x, y: -view.right.y, z: -view.right.z };
  if (direction === 'up') return view.up;
  return { x: -view.up.x, y: -view.up.y, z: -view.up.z };
}

interface AsyncDetailState {
  detail: unknown;
  error: unknown;
  key: string | null;
  loading: boolean;
  reloadToken: number;
}

const EMPTY_DETAIL_STATE: AsyncDetailState = {
  detail: undefined,
  error: null,
  key: null,
  loading: false,
  reloadToken: 0,
};

export default function GalaxyGraphVisualizer<NMeta = unknown, EMeta = unknown, CMeta = unknown>({
  accessors,
  brandLabel = 'Galaxy Nodes',
  className,
  controlActions,
  dataset,
  groups,
  initialGroup = null,
  legend,
  labels,
  layout,
  largeGraph,
  onContextBudgetExceeded,
  onDatasetSizeChange,
  onGroupChange,
  onHoverEdge,
  onHoverNode,
  onNavigate,
  onSceneFailure,
  onSelectEdge,
  onSelectNode,
  options,
  renderEdgeDetail,
  renderAccessibleSummary,
  renderNodeDetail,
  renderStats,
  selectedEdgeId,
  selectedNodeId,
  sideRailActions,
  theme,
}: GalaxyGraphVisualizerProps<NMeta, EMeta, CMeta>) {
  const [activeGroup, setActiveGroup] = useState<string | null>(initialGroup);
  const [showClusters, setShowClusters] = useState(options?.showClusters ?? true);
  const [galaxyMode, setGalaxyMode] = useState(options?.galaxyMode ?? true);
  const [playing, setPlaying] = useState(true);
  const [search, setSearch] = useState('');
  const [internalSelectedNode, setInternalSelectedNode] = useState<GraphNode<NMeta> | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode<NMeta> | null>(null);
  const [internalSelectedEdge, setInternalSelectedEdge] = useState<GraphEdge<EMeta> | null>(null);
  const [hoverEdge, setHoverEdge] = useState<GraphEdge<EMeta> | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const [augmentedDataset, setAugmentedDataset] = useState<GraphDataset<NMeta, EMeta, CMeta>>(dataset);
  const [nodeDetail, setNodeDetail] = useState<AsyncDetailState>(EMPTY_DETAIL_STATE);
  const [edgeDetail, setEdgeDetail] = useState<AsyncDetailState>(EMPTY_DETAIL_STATE);
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState<unknown>(null);
  const [sceneReady, setSceneReady] = useState(true);
  const [liveMessage, setLiveMessage] = useState('');
  const expansionAbortRef = useRef<AbortController | null>(null);
  const cameraViewRef = useRef<GalaxyCameraView | null>(null);
  const accessibleSummaryId = useId();
  const chromeLabels = useMemo(() => ({ ...DEFAULT_GALAXY_GRAPH_LABELS, ...labels }), [labels]);

  const showControls = options?.showControls ?? true;
  const showStats = options?.showStats ?? true;
  const showNavigationControls = options?.showNavigationControls ?? true;
  const showDetailPanel = options?.showDetailPanel ?? true;
  const showDatasetSizeControls = options?.showDatasetSizeControls ?? Boolean(options?.datasetSizes?.length);
  const largeGraphEnabled = Boolean(largeGraph?.enabled);
  const graphDataset = largeGraphEnabled ? augmentedDataset : dataset;
  const edgeBudget = largeGraph?.edgeBudget ?? DEFAULT_GRAPH_EDGE_BUDGET;
  const expandGraph = largeGraph?.expandGraph;
  const loadEdgeDetail = largeGraph?.loadEdgeDetail;
  const loadNodeDetail = largeGraph?.loadNodeDetail;
  const canExpandGraph = largeGraphEnabled && Boolean(expandGraph);
  const resolvedAccessors = useMemo(() => resolveAccessors(accessors), [accessors]);

  useEffect(() => {
    setAugmentedDataset(largeGraphEnabled ? mergeGraphDataset(dataset, {}, { edgeBudget }) : dataset);
    expansionAbortRef.current?.abort();
    setExpandError(null);
    setExpanding(false);
  }, [dataset, edgeBudget, largeGraphEnabled]);

  useEffect(() => {
    if (options?.showClusters !== undefined) setShowClusters(options.showClusters);
  }, [options?.showClusters]);

  useEffect(() => {
    if (options?.galaxyMode !== undefined) setGalaxyMode(options.galaxyMode);
  }, [options?.galaxyMode]);

  const groupList = useMemo(
    () => (groups ? [...groups] : distinctGroups(graphDataset.nodes)),
    [groups, graphDataset.nodes],
  );

  const groupNodes = useMemo(() => {
    if (activeGroup === null) return graphDataset.nodes;
    return graphDataset.nodes.filter((node) => node.group === activeGroup);
  }, [activeGroup, graphDataset.nodes]);

  const endpointGroups = useMemo(() => {
    const values = new Map<string, string | undefined>();
    graphDataset.nodes.forEach((node) => values.set(node.id, node.group));
    (graphDataset.clusters ?? []).forEach((cluster) => values.set(cluster.id, cluster.group));
    return values;
  }, [graphDataset.clusters, graphDataset.nodes]);

  // Precompute edge <-> display-id maps once per dataset. Resolving ids by
  // scanning dataset.edges with indexOf on every lookup was O(n^2).
  const { edgeDisplayIds, edgeByDisplayId } = useMemo(() => {
    const byEdge = new Map<GraphEdge<EMeta>, string>();
    const byId = new Map<string, GraphEdge<EMeta>>();
    graphDataset.edges.forEach((edge, index) => {
      const id = getEdgeId(edge, index);
      byEdge.set(edge, id);
      byId.set(id, edge);
    });
    return { edgeDisplayIds: byEdge, edgeByDisplayId: byId };
  }, [graphDataset.edges]);

  const displayEdgeId = useCallback(
    (edge: GraphEdge<EMeta>) => edgeDisplayIds.get(edge) ?? getEdgeId(edge),
    [edgeDisplayIds],
  );

  const groupEdges = useMemo(() => {
    if (activeGroup === null) return graphDataset.edges;
    return graphDataset.edges.filter(
      (edge) => endpointGroups.get(edge.source) === activeGroup || endpointGroups.get(edge.target) === activeGroup,
    );
  }, [activeGroup, graphDataset.edges, endpointGroups]);

  const selectedNode = useMemo(() => {
    if (selectedNodeId !== undefined) return graphDataset.nodes.find((node) => node.id === selectedNodeId) ?? null;
    return internalSelectedNode && graphDataset.nodes.includes(internalSelectedNode) ? internalSelectedNode : null;
  }, [graphDataset.nodes, internalSelectedNode, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    if (selectedEdgeId !== undefined) return (selectedEdgeId !== null && edgeByDisplayId.get(selectedEdgeId)) || null;
    return internalSelectedEdge && graphDataset.edges.includes(internalSelectedEdge) ? internalSelectedEdge : null;
  }, [graphDataset.edges, edgeByDisplayId, internalSelectedEdge, selectedEdgeId]);

  const stats = useMemo<GraphStats>(() => {
    const groupCount = new Set(groupNodes.map((node) => node.group ?? '')).size;
    const major = groupNodes.filter((node) => node.major).length;
    return {
      edges: groupEdges.length,
      groups: groupCount,
      major,
      nodes: groupNodes.length,
    };
  }, [groupEdges.length, groupNodes]);

  const accessibleSummaryLimit = Math.max(0, options?.accessibleSummaryLimit ?? 50);
  const accessibleSummaryContext = useMemo<GalaxyAccessibleSummaryContext<NMeta, EMeta, CMeta>>(
    () => ({
      accessors: resolvedAccessors,
      activeGroup,
      dataset: graphDataset,
      edges: groupEdges.slice(0, accessibleSummaryLimit),
      labels: chromeLabels,
      nodes: groupNodes.slice(0, accessibleSummaryLimit),
      stats,
    }),
    [accessibleSummaryLimit, activeGroup, chromeLabels, graphDataset, groupEdges, groupNodes, resolvedAccessors, stats],
  );

  const announceNodeSelection = useCallback(
    (node: GraphNode<NMeta>) => {
      const index =
        Math.max(
          0,
          groupNodes.findIndex((entry) => entry.id === node.id),
        ) + 1;
      setLiveMessage(
        chromeLabels.nodeSelectionAnnouncement(nodeDisplayText(node, resolvedAccessors), index, groupNodes.length),
      );
    },
    [chromeLabels, groupNodes, resolvedAccessors],
  );

  const issueCameraCommand = useCallback(
    (command: Omit<CameraCommand, 'nonce'>) => {
      const nextCommand = { ...command, nonce: Date.now() } as CameraCommand;
      setCameraCommand(nextCommand);
      onNavigate?.(nextCommand);
    },
    [onNavigate],
  );

  const selectNode = useCallback(
    (node: GraphNode<NMeta> | null) => {
      if (selectedNodeId === undefined) setInternalSelectedNode(node);
      if (node) {
        if (selectedEdgeId === undefined) setInternalSelectedEdge(null);
        if (selectedEdge) onSelectEdge?.(null);
        announceNodeSelection(node);
      }
      onSelectNode?.(node);
    },
    [announceNodeSelection, onSelectEdge, onSelectNode, selectedEdge, selectedEdgeId, selectedNodeId],
  );

  const hover = useCallback(
    (node: GraphNode<NMeta> | null) => {
      setHoverNode(node);
      onHoverNode?.(node);
    },
    [onHoverNode],
  );

  const selectEdge = useCallback(
    (edge: GraphEdge<EMeta> | null) => {
      if (selectedEdgeId === undefined) setInternalSelectedEdge(edge);
      if (edge) {
        if (selectedNodeId === undefined) setInternalSelectedNode(null);
        if (selectedNode) onSelectNode?.(null);
      }
      onSelectEdge?.(edge);
    },
    [onSelectEdge, onSelectNode, selectedEdgeId, selectedNode, selectedNodeId],
  );

  const hoverConnection = useCallback(
    (edge: GraphEdge<EMeta> | null) => {
      setHoverEdge(edge);
      onHoverEdge?.(edge);
    },
    [onHoverEdge],
  );

  function clearSelection() {
    const shouldNotifyNode = selectedNodeId !== undefined ? selectedNodeId !== null : selectedNode !== null;
    const shouldNotifyEdge = selectedEdgeId !== undefined ? selectedEdgeId !== null : selectedEdge !== null;
    if (selectedNodeId === undefined) setInternalSelectedNode(null);
    if (shouldNotifyNode) onSelectNode?.(null);
    if (selectedEdgeId === undefined) setInternalSelectedEdge(null);
    if (shouldNotifyEdge) onSelectEdge?.(null);
  }

  function chooseGroup(group: string | null) {
    setActiveGroup(group);
    clearSelection();
    onGroupChange?.(group);
  }

  function requestDatasetSize(size: number) {
    onDatasetSizeChange?.(size);
    clearSelection();
    setHoverNode(null);
    setHoverEdge(null);
  }

  function focusNode(node: GraphNode<NMeta> | null) {
    if (!node || !sceneReady) return;
    selectNode(node);
    issueCameraCommand({ nodeId: node.id, type: 'focus' });
  }

  function focusEdge(edge: GraphEdge<EMeta> | null) {
    if (!edge || !sceneReady) return;
    selectEdge(edge);
    issueCameraCommand({ edgeId: displayEdgeId(edge), type: 'focus-edge' });
  }

  function moveCamera(direction: SpaceDirection) {
    if (!sceneReady) return;
    issueCameraCommand({ direction, type: 'move' });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    focusNode(findBestMatch(graphDataset, search, activeGroup, resolvedAccessors));
  }

  function focusNodeAtIndex(index: number) {
    if (!groupNodes.length) return;
    const clamped = Math.max(0, Math.min(groupNodes.length - 1, index));
    focusNode(groupNodes[clamped]);
  }

  function focusRelativeNode(offset: number) {
    if (!groupNodes.length) return;
    const currentIndex = selectedNode ? groupNodes.findIndex((node) => node.id === selectedNode.id) : -1;
    const fallbackIndex = offset > 0 ? -1 : groupNodes.length;
    const nextIndex = (currentIndex >= 0 ? currentIndex : fallbackIndex) + offset;
    focusNodeAtIndex((nextIndex + groupNodes.length) % groupNodes.length);
  }

  function handleKeyboardTraversal(event: React.KeyboardEvent<HTMLElement>) {
    if (isInteractiveTarget(event.target)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.galaxy-scene')) return;

    if (event.key === 'PageDown' || event.key === ']' || event.key.toLowerCase() === 'n') {
      event.preventDefault();
      focusRelativeNode(1);
    } else if (event.key === 'PageUp' || event.key === '[' || event.key.toLowerCase() === 'p') {
      event.preventDefault();
      focusRelativeNode(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusNodeAtIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusNodeAtIndex(groupNodes.length - 1);
    } else if (event.key === 'Enter' && selectedNode) {
      event.preventDefault();
      focusNode(selectedNode);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clearSelection();
      setLiveMessage('');
    }
  }

  const inspectedNode = selectedNode ?? (selectedEdge ? null : hoverNode);
  const inspectedEdge = selectedNode ? null : (selectedEdge ?? (!inspectedNode ? hoverEdge : null));
  const currentSelectedNodeId = selectedNode?.id ?? null;
  const currentSelectedEdgeId = currentSelectedNodeId || !selectedEdge ? null : displayEdgeId(selectedEdge);
  const sourceEndpoint = useMemo(
    () => (inspectedEdge ? findEndpoint(graphDataset, inspectedEdge.source, resolvedAccessors) : null),
    [graphDataset, inspectedEdge, resolvedAccessors],
  );
  const targetEndpoint = useMemo(
    () => (inspectedEdge ? findEndpoint(graphDataset, inspectedEdge.target, resolvedAccessors) : null),
    [graphDataset, inspectedEdge, resolvedAccessors],
  );
  const sceneControlDisabled = !sceneReady;

  const runExpansion = useCallback(
    async (request: Omit<LargeGraphExpandRequest, 'activeGroup' | 'loadedEdgeIds' | 'loadedNodeIds'>) => {
      if (!largeGraphEnabled || !expandGraph) return;
      expansionAbortRef.current?.abort();
      const controller = new AbortController();
      expansionAbortRef.current = controller;
      setExpanding(true);
      setExpandError(null);

      try {
        const patch = await expandGraph(
          {
            ...request,
            activeGroup,
            loadedEdgeIds: graphDataset.edges.map(displayEdgeId),
            loadedNodeIds: graphDataset.nodes.map((node) => node.id),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setAugmentedDataset((current) => mergeGraphDataset(current, patch, { edgeBudget }));
      } catch (error) {
        if (!controller.signal.aborted) setExpandError(error);
      } finally {
        if (expansionAbortRef.current === controller) expansionAbortRef.current = null;
        if (!controller.signal.aborted) setExpanding(false);
      }
    },
    [activeGroup, displayEdgeId, edgeBudget, expandGraph, graphDataset.edges, graphDataset.nodes, largeGraphEnabled],
  );

  const expandNode = useCallback(
    (node: GraphNode<NMeta> | null) => {
      if (!node) return;
      void runExpansion({ camera: cameraViewRef.current ?? undefined, nodeId: node.id, type: 'node' });
    },
    [runExpansion],
  );

  const expandDirection = useCallback(
    (direction: SpaceDirection) => {
      const cameraView = cameraViewRef.current;
      void runExpansion({
        camera: cameraView ?? undefined,
        direction,
        directionVector: vectorForDirection(cameraView, direction),
        type: 'direction',
      });
    },
    [runExpansion],
  );

  const handleCameraViewChange = useCallback((view: GalaxyCameraView) => {
    cameraViewRef.current = view;
  }, []);

  useEffect(() => {
    if (!largeGraphEnabled || !loadNodeDetail || !selectedNode) {
      setNodeDetail(EMPTY_DETAIL_STATE);
      return undefined;
    }

    const controller = new AbortController();
    const key = selectedNode.id;
    setNodeDetail((current) => ({ ...current, detail: undefined, error: null, key, loading: true }));
    loadNodeDetail(selectedNode, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted)
          setNodeDetail((current) => ({ ...current, detail, error: null, key, loading: false }));
      },
      (error) => {
        if (!controller.signal.aborted) {
          setNodeDetail((current) => ({ ...current, detail: undefined, error, key, loading: false }));
        }
      },
    );

    return () => controller.abort();
  }, [largeGraphEnabled, loadNodeDetail, nodeDetail.reloadToken, selectedNode]);

  useEffect(() => {
    if (!largeGraphEnabled || !loadEdgeDetail || !selectedEdge || !sourceEndpoint || !targetEndpoint) {
      setEdgeDetail(EMPTY_DETAIL_STATE);
      return undefined;
    }

    const controller = new AbortController();
    const key = currentSelectedEdgeId;
    const endpoints = { source: sourceEndpoint, target: targetEndpoint };
    setEdgeDetail((current) => ({ ...current, detail: undefined, error: null, key, loading: true }));
    loadEdgeDetail(selectedEdge, endpoints, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted)
          setEdgeDetail((current) => ({ ...current, detail, error: null, key, loading: false }));
      },
      (error) => {
        if (!controller.signal.aborted) {
          setEdgeDetail((current) => ({ ...current, detail: undefined, error, key, loading: false }));
        }
      },
    );

    return () => controller.abort();
  }, [
    currentSelectedEdgeId,
    edgeDetail.reloadToken,
    largeGraphEnabled,
    loadEdgeDetail,
    selectedEdge,
    sourceEndpoint,
    targetEndpoint,
  ]);

  const nodeDetailContext = useMemo<LargeGraphDetailContext | undefined>(() => {
    if (!largeGraphEnabled || inspectedNode !== selectedNode) return undefined;
    return {
      detail: nodeDetail.detail,
      error: nodeDetail.error,
      expand: () => expandNode(inspectedNode),
      loading: nodeDetail.loading,
      reload: () => setNodeDetail((current) => ({ ...current, reloadToken: current.reloadToken + 1 })),
    };
  }, [
    expandNode,
    inspectedNode,
    largeGraphEnabled,
    nodeDetail.detail,
    nodeDetail.error,
    nodeDetail.loading,
    selectedNode,
  ]);

  const edgeDetailContext = useMemo<LargeGraphDetailContext | undefined>(() => {
    if (!largeGraphEnabled || inspectedEdge !== selectedEdge) return undefined;
    return {
      detail: edgeDetail.detail,
      error: edgeDetail.error,
      expand: () => undefined,
      loading: edgeDetail.loading,
      reload: () => setEdgeDetail((current) => ({ ...current, reloadToken: current.reloadToken + 1 })),
    };
  }, [edgeDetail.detail, edgeDetail.error, edgeDetail.loading, inspectedEdge, largeGraphEnabled, selectedEdge]);

  return (
    <main
      className={['galaxy-nodes', className].filter(Boolean).join(' ')}
      style={themeStyle(theme)}
      onKeyDownCapture={handleKeyboardTraversal}
    >
      <GalaxyScene<NMeta, EMeta, CMeta>
        dataset={graphDataset}
        accessibility={{
          describedBy: accessibleSummaryId,
          keyShortcuts: 'PageDown PageUp Home End Enter Escape',
          label: chromeLabels.accessibleGraphLabel,
        }}
        activeGroup={activeGroup}
        showClusters={showClusters}
        galaxyMode={galaxyMode}
        layout={layout}
        contextLimit={options?.webglContextLimit}
        accessors={accessors}
        paused={!playing}
        motionPreference={options?.motionPreference}
        planetSizing={options?.planetSizing}
        theme={theme}
        cameraCommand={cameraCommand}
        selectedNodeId={currentSelectedNodeId}
        selectedEdgeId={currentSelectedEdgeId}
        onSceneFailure={(failure) => {
          setSceneReady(false);
          onSceneFailure?.(failure);
        }}
        onSceneReady={() => setSceneReady(true)}
        onCameraViewChange={handleCameraViewChange}
        onContextBudgetExceeded={onContextBudgetExceeded}
        onSelectNode={selectNode}
        onHoverNode={hover}
        onSelectEdge={selectEdge}
        onHoverEdge={hoverConnection}
      />

      <header className="top-bar">
        <div className="brand">
          <CircleDot size={20} aria-hidden="true" />
          <span>{brandLabel}</span>
          <b>{chromeLabels.alphaBadge}</b>
        </div>
        {(options?.showGroupNav ?? true) && groupList.length ? (
          <nav className="category-nav" aria-label={chromeLabels.groupsNav}>
            <button
              className={activeGroup === null ? 'is-active' : ''}
              type="button"
              aria-pressed={activeGroup === null}
              onClick={() => chooseGroup(null)}
            >
              {chromeLabels.allGroups}
            </button>
            {groupList.map((group) => (
              <button
                key={group}
                className={group === activeGroup ? 'is-active' : ''}
                type="button"
                aria-pressed={group === activeGroup}
                onClick={() => chooseGroup(group)}
              >
                {group}
              </button>
            ))}
          </nav>
        ) : null}
        {(options?.showSearch ?? true) ? (
          <form className="search-box" onSubmit={submitSearch}>
            <button type="submit" title={chromeLabels.focusMatchingNode} aria-label={chromeLabels.focusMatchingNode}>
              <Search size={15} aria-hidden="true" />
            </button>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={chromeLabels.searchPlaceholder}
              aria-label={chromeLabels.searchInput}
            />
          </form>
        ) : null}
      </header>

      <section id={accessibleSummaryId} className="visually-hidden" aria-label={chromeLabels.accessibleSummaryHeading}>
        <p>{chromeLabels.traversalHelp}</p>
        {renderAccessibleSummary
          ? renderAccessibleSummary(accessibleSummaryContext)
          : renderDefaultAccessibleSummary(accessibleSummaryContext)}
      </section>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {showControls ? (
        <section className="control-ribbon" aria-label={chromeLabels.graphControls}>
          <div className="toggle-row">
            <button
              type="button"
              className={showClusters ? 'toggle is-on' : 'toggle'}
              aria-pressed={showClusters}
              onClick={() => setShowClusters((value) => !value)}
            >
              <Layers3 size={15} aria-hidden="true" />
              {chromeLabels.clusterToggle} <span>{showClusters ? chromeLabels.on : chromeLabels.off}</span>
            </button>
            {controlActions}
          </div>

          {(options?.showTimeline ?? true) ? (
            <div className="playback">
              <button
                type="button"
                className="icon-button"
                onClick={() => setPlaying((value) => !value)}
                title={playing ? chromeLabels.pauseMotion : chromeLabels.playMotion}
                aria-label={playing ? chromeLabels.pauseMotion : chromeLabels.playMotion}
                aria-pressed={playing}
              >
                {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              </button>
              <span>{playing ? chromeLabels.motionOn : chromeLabels.motionOff}</span>
            </div>
          ) : null}

          {showStats ? (
            renderStats ? (
              renderStats(stats)
            ) : (
              <div className="stats">
                <span>{chromeLabels.formatGroupsCount(stats.groups)}</span>
                <span>{chromeLabels.formatNodesCount(stats.nodes)}</span>
                <span>{chromeLabels.formatEdgesCount(stats.edges)}</span>
                <span>{chromeLabels.formatMajorCount(stats.major)}</span>
              </div>
            )
          ) : null}

          {showDatasetSizeControls && options?.datasetSizes?.length && onDatasetSizeChange ? (
            <div className="segmented" aria-label={chromeLabels.datasetSize}>
              {options.datasetSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={graphDataset.nodes.length === size ? 'is-active' : ''}
                  aria-pressed={graphDataset.nodes.length === size}
                  onClick={() => requestDatasetSize(size)}
                >
                  {formatCompactNumber(size)}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className={galaxyMode ? 'pill-button is-active' : 'pill-button'}
            aria-pressed={galaxyMode}
            onClick={() => setGalaxyMode((value) => !value)}
          >
            <Sparkles size={15} aria-hidden="true" />
            {chromeLabels.galaxyMode}
          </button>
        </section>
      ) : null}

      <aside className="side-rail" aria-label={chromeLabels.sceneTools}>
        <button
          type="button"
          title={chromeLabels.resetCamera}
          aria-label={chromeLabels.resetCamera}
          disabled={sceneControlDisabled}
          onClick={() => issueCameraCommand({ type: 'reset' })}
        >
          <RotateCcw size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          title={chromeLabels.focusSelection}
          aria-label={chromeLabels.focusSelection}
          disabled={sceneControlDisabled || (!inspectedEdge && !inspectedNode)}
          onClick={() => {
            if (inspectedEdge) focusEdge(inspectedEdge);
            else focusNode(inspectedNode);
          }}
        >
          <Focus size={17} aria-hidden="true" />
        </button>
        {sideRailActions}
        {showNavigationControls ? (
          <>
            <div className="nav-pad" aria-label={chromeLabels.spaceNavigation}>
              <button
                type="button"
                title={chromeLabels.moveUp}
                aria-label={chromeLabels.moveUp}
                disabled={sceneControlDisabled}
                onClick={() => moveCamera('up')}
              >
                <ChevronUp size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.moveForward}
                aria-label={chromeLabels.moveForward}
                disabled={sceneControlDisabled}
                onClick={() => moveCamera('forward')}
              >
                <ArrowUp size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.moveLeft}
                aria-label={chromeLabels.moveLeft}
                disabled={sceneControlDisabled}
                onClick={() => moveCamera('left')}
              >
                <ArrowLeft size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.moveRight}
                aria-label={chromeLabels.moveRight}
                disabled={sceneControlDisabled}
                onClick={() => moveCamera('right')}
              >
                <ArrowRight size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.moveBackward}
                aria-label={chromeLabels.moveBackward}
                disabled={sceneControlDisabled}
                onClick={() => moveCamera('back')}
              >
                <ArrowDown size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={chromeLabels.moveDown}
                aria-label={chromeLabels.moveDown}
                disabled={sceneControlDisabled}
                onClick={() => moveCamera('down')}
              >
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            </div>
            {canExpandGraph ? (
              <div className="nav-pad" aria-label={chromeLabels.loadMoreGraphData}>
                <button
                  type="button"
                  title={chromeLabels.loadMoreUp}
                  aria-label={chromeLabels.loadMoreUp}
                  disabled={sceneControlDisabled || expanding}
                  onClick={() => expandDirection('up')}
                >
                  <ChevronUp size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title={chromeLabels.loadMoreForward}
                  aria-label={chromeLabels.loadMoreForward}
                  disabled={sceneControlDisabled || expanding}
                  onClick={() => expandDirection('forward')}
                >
                  <ArrowUp size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title={chromeLabels.loadMoreLeft}
                  aria-label={chromeLabels.loadMoreLeft}
                  disabled={sceneControlDisabled || expanding}
                  onClick={() => expandDirection('left')}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title={chromeLabels.loadMoreRight}
                  aria-label={chromeLabels.loadMoreRight}
                  disabled={sceneControlDisabled || expanding}
                  onClick={() => expandDirection('right')}
                >
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title={chromeLabels.loadMoreBackward}
                  aria-label={chromeLabels.loadMoreBackward}
                  disabled={sceneControlDisabled || expanding}
                  onClick={() => expandDirection('back')}
                >
                  <ArrowDown size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title={chromeLabels.loadMoreDown}
                  aria-label={chromeLabels.loadMoreDown}
                  disabled={sceneControlDisabled || expanding}
                  onClick={() => expandDirection('down')}
                >
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </aside>

      {(options?.showLegend ?? true) && legend ? <div className="legend">{legend}</div> : null}

      {showDetailPanel && inspectedNode ? (
        <aside className="detail-panel">
          {renderNodeDetail ? (
            renderNodeDetail(inspectedNode, nodeDetailContext)
          ) : (
            <>
              <div className="detail-heading">
                <Radar size={18} aria-hidden="true" />
                <div>
                  {inspectedNode.group ? <span>{inspectedNode.group}</span> : null}
                  <h2>{nodeDisplayText(inspectedNode, resolvedAccessors)}</h2>
                </div>
              </div>
              <dl>
                <div>
                  <dt>{chromeLabels.nodeId}</dt>
                  <dd>{inspectedNode.id}</dd>
                </div>
                {inspectedNode.group ? (
                  <div>
                    <dt>{chromeLabels.group}</dt>
                    <dd>{inspectedNode.group}</dd>
                  </div>
                ) : null}
                {inspectedNode.size !== undefined ? (
                  <div>
                    <dt>{chromeLabels.size}</dt>
                    <dd>{inspectedNode.size.toFixed(1)}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          )}
          <button type="button" disabled={sceneControlDisabled} onClick={() => focusNode(inspectedNode)}>
            <Upload size={15} aria-hidden="true" />
            {chromeLabels.navigate}
          </button>
          {canExpandGraph ? (
            <button
              type="button"
              disabled={sceneControlDisabled || expanding}
              onClick={() => expandNode(inspectedNode)}
            >
              <GitBranch size={15} aria-hidden="true" />
              {expanding ? chromeLabels.loading : chromeLabels.expandNeighbors}
            </button>
          ) : null}
          {largeGraphEnabled && expandError ? <span role="status">{chromeLabels.expansionFailed}</span> : null}
        </aside>
      ) : null}

      {showDetailPanel && inspectedEdge && sourceEndpoint && targetEndpoint ? (
        <aside className="detail-panel connection-panel">
          {renderEdgeDetail ? (
            renderEdgeDetail(inspectedEdge, { source: sourceEndpoint, target: targetEndpoint }, edgeDetailContext)
          ) : (
            <>
              <div className="detail-heading">
                <GitBranch size={18} aria-hidden="true" />
                <div>
                  <span>{edgeDisplayText(inspectedEdge, resolvedAccessors)}</span>
                  <h2>
                    {sourceEndpoint.label} <small>{chromeLabels.to}</small> {targetEndpoint.label}
                  </h2>
                </div>
              </div>
              <div className="score-line">
                <strong>{Math.round((inspectedEdge.weight ?? 0.5) * 100)}%</strong>
                <span>{chromeLabels.strength}</span>
              </div>
              <dl>
                <div>
                  <dt>{chromeLabels.relationshipId}</dt>
                  <dd>{displayEdgeId(inspectedEdge)}</dd>
                </div>
                {sourceEndpoint.group ? (
                  <div>
                    <dt>{chromeLabels.source}</dt>
                    <dd>{sourceEndpoint.group}</dd>
                  </div>
                ) : null}
                {targetEndpoint.group ? (
                  <div>
                    <dt>{chromeLabels.target}</dt>
                    <dd>{targetEndpoint.group}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          )}
          <div className="detail-actions">
            <button type="button" disabled={sceneControlDisabled} onClick={() => focusEdge(inspectedEdge)}>
              <Navigation size={15} aria-hidden="true" />
              {chromeLabels.traceLink}
            </button>
            {sourceEndpoint.node ? (
              <button type="button" disabled={sceneControlDisabled} onClick={() => focusNode(sourceEndpoint.node)}>
                {chromeLabels.source}
              </button>
            ) : null}
            {targetEndpoint.node ? (
              <button type="button" disabled={sceneControlDisabled} onClick={() => focusNode(targetEndpoint.node)}>
                {chromeLabels.target}
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
    </main>
  );
}
