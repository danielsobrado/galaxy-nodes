import type { ReactNode } from 'react';
import type {
  CameraCommand,
  GalaxyGraphTheme,
  GalaxyGraphThemeChoice,
  GalaxyGraphThemeInput,
  GalaxyMotionPreference,
  GalaxyPlanetSizingOptions,
  GalaxyRenderMode,
  GalaxySceneFailure,
  GalaxySceneProps,
} from './GalaxyScene';
import type { GraphLayoutInput } from '../domain/layout';
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
} from '../domain/types';

export interface GraphStats {
  nodes: number;
  groups: number;
  edges: number;
  major: number;
}

export interface GalaxyGraphVisualizerOptions {
  accessibleSummaryLimit?: number;
  datasetSizes?: readonly number[];
  /** Expected final element count (nodes + edges); picks the render tier up front for streamed data. */
  expectedSize?: number;
  galaxyMode?: boolean;
  /** Delay before showing the node detail panel next to a hovered node. Defaults to 2000ms. */
  hoverDetailDelayMs?: number;
  motionPreference?: GalaxyMotionPreference;
  /** Global multiplier for rendered node point sprites. Defaults to a slightly larger 1.22. */
  nodeSizeScale?: number;
  planetSizing?: GalaxyPlanetSizingOptions;
  /** Edge render tier: 'auto' (default), 'quality' (tube edges), or 'scale' (lightweight line edges). */
  renderMode?: GalaxyRenderMode;
  showClusters?: boolean;
  showControls?: boolean;
  showDatasetSizeControls?: boolean;
  showDetailPanel?: boolean;
  showGroupNav?: boolean;
  showKeyLegend?: boolean;
  showLegend?: boolean;
  showNavigationControls?: boolean;
  showSearch?: boolean;
  showStats?: boolean;
  showTimeline?: boolean;
  showThemeControl?: boolean;
  themeChoices?: readonly GalaxyGraphThemeChoice[];
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
  theme: string;
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
  initialTheme?: GalaxyGraphThemeInput;
  /** Replaces the legend strip; nothing renders without it. */
  legend?: ReactNode;
  /** Optional keyboard/mouse shortcut legend overlay. */
  keyLegend?: ReactNode;
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
  onThemeChange?: (theme: GalaxyGraphThemeInput) => void;
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
  theme?: GalaxyGraphThemeInput;
}

export type { GalaxyGraphTheme, GalaxyGraphThemeChoice, GalaxyGraphThemeInput };

export interface AsyncDetailState {
  detail: unknown;
  error: unknown;
  key: string | null;
  loading: boolean;
  reloadToken: number;
}
