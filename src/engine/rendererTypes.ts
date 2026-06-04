import type { GraphLayoutInput } from '../domain/layout';
import type {
  GalaxyCameraView,
  GraphAccessors,
  GraphCluster,
  GraphDataset,
  GraphEdge,
  GraphNode,
  SpaceDirection,
} from '../domain/types';
import type { GalaxyMotionPreference, GalaxyRendererContextBudget, ResolvedGalaxyMotion } from './environment';
import type { GalaxyGraphThemeInput, GalaxyPlanetSizingOptions, GalaxyRenderMode } from './rendererConfig';
import type { GalaxySceneFailure } from './sceneFallback';
import type { GalaxyViewMode, GalaxyVisibilityModelOptions, GalaxyVisibilityOverflow } from './visibilityModel';

export type {
  GalaxyViewMode,
  GalaxyVisibilityBudget,
  GalaxyVisibilityModelOptions,
  GalaxyVisibilityOverflowSummary,
} from './visibilityModel';

export type PathFocusType = 'dependency' | 'impact' | 'ownership' | string;

export interface FocusPathResult {
  edgeIds: string[];
  label?: string;
  nodeIds: string[];
}

export interface GalaxyFocusModelOptions {
  cameraDurationMs?: number;
  dataTimeoutMs?: number;
  enabled?: boolean;
  maxExpandedNeighbors?: number;
  maxPrimaryNeighbors?: number;
  maxSecondHopNeighbors?: number;
  variant?: GraphUxVariant;
}

export interface CameraCommand {
  type:
    | 'focus'
    | 'focus-edge'
    | 'move'
    | 'reset'
    | 'expand-neighbors'
    | 'expand-deep'
    | 'collapse-neighbors'
    | 'collapse-all'
    | 'show-path'
    | 'hide-path'
    | 'inspect-path'
    | 'back'
    | 'recenter'
    | 'unfocus'
    | 'focus-data-ready'
    | 'focus-data-missing'
    | 'focus-data-timeout'
    | 'focus-load-failed';
  direction?: SpaceDirection;
  edgeId?: string;
  dataReady?: boolean;
  nodeId?: string;
  nonce: number;
  path?: FocusPathResult;
  pathType?: PathFocusType;
}

export interface GalaxyNodeHoverAnchor {
  nodeId: string;
  viewportHeight: number;
  viewportWidth: number;
  visible: boolean;
  x: number;
  y: number;
}

export type GraphUxVariant = 'baseline' | 'cameraOnly' | 'fullFocus';

export type GraphCameraState = 'idle' | 'moving' | 'focused' | 'orbit';

export type GraphUxEvent =
  | {
      type: 'node_hover';
      nodeId: string;
      timestampMs: number;
    }
  | {
      type: 'node_click';
      nodeId: string;
      timestampMs: number;
      cameraState: GraphCameraState;
    }
  | {
      type: 'focus_started';
      nodeId: string;
      timestampMs: number;
      variant: GraphUxVariant;
    }
  | {
      type: 'focus_completed';
      nodeId: string;
      timestampMs: number;
      durationMs: number;
      visibleNodeCount: number;
      visibleEdgeCount: number;
    }
  | {
      type: 'camera_reset';
      timestampMs: number;
      focusedNodeId?: string;
    }
  | {
      type: 'zoom_changed';
      timestampMs: number;
      zoomDistance: number;
      focusedNodeId?: string;
    }
  | {
      type: 'pan_or_orbit';
      timestampMs: number;
      focusedNodeId?: string;
    }
  | {
      type: 'cluster_click';
      clusterId: string;
      timestampMs: number;
      viewMode: GalaxyViewMode;
    }
  | {
      type: 'view_mode_changed';
      focusedNodeId?: string;
      from: GalaxyViewMode;
      timestampMs: number;
      to: GalaxyViewMode;
    }
  | {
      type: 'visibility_projected';
      focusedNodeId?: string;
      hiddenEdgeCount: number;
      hiddenNodeCount: number;
      overflow: GalaxyVisibilityOverflow;
      timestampMs: number;
      viewMode: GalaxyViewMode;
      visibleEdgeCount: number;
      visibleNodeCount: number;
    }
  | {
      type: 'task_started';
      taskId: string;
      timestampMs: number;
      variant: string;
    }
  | {
      type: 'task_completed';
      taskId: string;
      timestampMs: number;
      success: boolean;
      answerCorrect: boolean;
    };

export interface GalaxyRendererOptions<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  dataset: GraphDataset<NMeta, EMeta, CMeta>;
  /** Active group filter, or `null` to show everything. */
  activeGroup: string | null;
  showClusters: boolean;
  galaxyMode: boolean;
  layout?: GraphLayoutInput;
  /** Visual accessors. They are now applied in place rather than rebuilding the scene. */
  accessors?: GraphAccessors<NMeta, EMeta>;
  theme?: GalaxyGraphThemeInput;
  cameraCommand: CameraCommand | null;
  /** UX experiment variant attached to graph interaction telemetry. Defaults to `'baseline'`. */
  uxVariant?: GraphUxVariant;
  /** Click-to-focus state machine and camera behavior. Disabled by default for compatibility. */
  focusModel?: GalaxyFocusModelOptions;
  /** Opt-in render-graph projection for default/expanded/deep/path views. Disabled by default. */
  visibilityModel?: GalaxyVisibilityModelOptions<NMeta, EMeta>;
  /** Maximum active Galaxy renderer WebGL contexts allowed in this browser tab. Defaults to 12. */
  contextLimit?: number;
  motionPreference?: GalaxyMotionPreference;
  paused?: boolean;
  /** Global multiplier for rendered node point sprites. Defaults to a slightly larger 1.22. */
  nodeSizeScale?: number;
  planetSizing?: GalaxyPlanetSizingOptions;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /**
   * Expected final element count (nodes + edges) for streamed/progressive datasets.
   * The render tier is chosen up front from this hint so a graph that grows past the
   * scale threshold mid-stream is never rebuilt from tubes to lines. Construction-time
   * only; changing it after mount has no effect until the scene rebuilds.
   */
  expectedSize?: number;
  /**
   * Edge render tier. `'auto'` (default) uses tube edges for small graphs and switches
   * to lightweight line edges past the scale threshold; `'quality'` forces tubes,
   * `'scale'` forces lines. Construction-time only.
   */
  renderMode?: GalaxyRenderMode;
}

export interface GalaxyRendererCallbacks<NMeta = unknown, EMeta = unknown> {
  onCameraViewChange?: (view: GalaxyCameraView) => void;
  onContextBudgetExceeded?: (budget: GalaxyRendererContextBudget) => void;
  onSceneFailure?: (failure: GalaxySceneFailure) => void;
  onSceneReady?: () => void;
  onGraphUxEvent?: (event: GraphUxEvent) => void;
  onSelectNode?: (node: GraphNode<NMeta> | null) => void;
  onHoverNode?: (node: GraphNode<NMeta> | null) => void;
  onHoverNodeAnchor?: (anchor: GalaxyNodeHoverAnchor | null) => void;
  onSelectEdge?: (edge: GraphEdge<EMeta> | null) => void;
  onHoverEdge?: (edge: GraphEdge<EMeta> | null) => void;
  onSelectCluster?: (cluster: GraphCluster | null) => void;
}

export interface MutableRef<T> {
  current: T;
}

export type SceneCallbacks<NMeta = unknown, EMeta = unknown> = Required<
  Pick<GalaxyRendererCallbacks<NMeta, EMeta>, 'onHoverEdge' | 'onHoverNode' | 'onSelectEdge' | 'onSelectNode'>
> &
  Pick<
    GalaxyRendererCallbacks<NMeta, EMeta>,
    'onCameraViewChange' | 'onGraphUxEvent' | 'onHoverNodeAnchor' | 'onSelectCluster'
  >;

export interface GalaxyRenderer<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  backFocus: () => void;
  collapseAll: () => void;
  collapseNeighbors: () => void;
  expandDeep: () => void;
  expandNeighbors: (depth?: 1 | 2) => void;
  focusEdge: (edgeId: string) => void;
  focusNode: (nodeId: string) => void;
  hidePath: () => void;
  inspectPath: (nodeId?: string) => void;
  moveCamera: (direction: SpaceDirection, multiplier?: number) => void;
  recenterFocus: () => void;
  resetCamera: () => void;
  showPath: (pathType: PathFocusType, path: FocusPathResult) => void;
  unfocus: () => void;
  retry: () => void;
  update: (
    options: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
    callbacks?: GalaxyRendererCallbacks<NMeta, EMeta>,
  ) => void;
  dispose: () => void;
}

export interface SceneRuntime<NMeta = unknown, EMeta = unknown> {
  backFocus: () => void;
  collapseAll: () => void;
  collapseNeighbors: () => void;
  completeFocusData: (nodeId: string) => void;
  expandDeep: () => void;
  expandNeighbors: (depth?: 1 | 2) => void;
  failFocusData: (nodeId: string) => void;
  focusEdge: (edgeId: string) => void;
  focusNode: (nodeId: string, dataReady?: boolean) => void;
  hidePath: () => void;
  inspectPath: (nodeId?: string) => void;
  moveCamera: (direction: SpaceDirection, multiplier?: number) => void;
  recenterFocus: () => void;
  resetCamera: () => void;
  showPath: (pathType: PathFocusType, path: FocusPathResult) => void;
  timeoutFocusData: (nodeId: string) => void;
  unfocus: () => void;
  updateAccessors: (accessors: GraphAccessors<NMeta, EMeta> | undefined) => void;
  updateActiveGroup: (activeGroup: string | null) => void;
  updateClusterVisibility: (showClusters: boolean) => void;
  updateGalaxyMode: (galaxyMode: boolean) => void;
  updateMotionPreference: (motion: ResolvedGalaxyMotion) => void;
  updateNodeSizeScale: (nodeSizeScale: number | undefined) => void;
  updatePlanetSizing: (planetSizing: GalaxyPlanetSizingOptions | undefined) => void;
  updateSelection: (selectedNodeId: string | null, selectedEdgeId: string | null) => void;
  updateTheme: (theme: GalaxyGraphThemeInput | undefined) => void;
  updateFocusModel: (focusModel: GalaxyFocusModelOptions | undefined) => void;
  updateUxVariant: (variant: GraphUxVariant | undefined) => void;
  updateVisibilityModel: (visibilityModel: GalaxyVisibilityModelOptions<NMeta, EMeta> | undefined) => void;
  appendDataset: (dataset: GraphDataset<NMeta, EMeta>) => void;
  dispose: () => void;
}

export interface AppliedRendererState<NMeta = unknown, EMeta = unknown> {
  accessors: GraphAccessors<NMeta, EMeta> | undefined;
  activeGroup: string | null;
  galaxyMode: boolean;
  nodeSizeScale: number | undefined;
  planetSizing: GalaxyPlanetSizingOptions | undefined;
  resolvedMotion: ResolvedGalaxyMotion;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  showClusters: boolean;
  theme: GalaxyGraphThemeInput | undefined;
  focusModel: GalaxyFocusModelOptions | undefined;
  uxVariant: GraphUxVariant | undefined;
  visibilityModel: GalaxyVisibilityModelOptions<NMeta, EMeta> | undefined;
}

export interface CoreState<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  appliedOptions: AppliedRendererState<NMeta, EMeta> | null;
  callbacks: GalaxyRendererCallbacks<NMeta, EMeta>;
  callbacksRef: MutableRef<SceneCallbacks<NMeta, EMeta>>;
  disposed: boolean;
  lastCameraCommandNonce: number | null;
  motionCleanup: (() => void) | null;
  options: GalaxyRendererOptions<NMeta, EMeta, CMeta>;
  pausedRef: MutableRef<boolean>;
  runtime: SceneRuntime<NMeta, EMeta> | null;
  sceneKey: string;
  resolvedMotion: ResolvedGalaxyMotion;
}
