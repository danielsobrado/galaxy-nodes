import type { GraphLayoutInput } from '../domain/layout';
import type { GraphAccessors, GraphDataset, SpaceDirection } from '../domain/types';
import {
  canUseDOM,
  detectWebGLAvailability,
  getGalaxyRendererContextBudget,
  reserveGalaxyRendererContext,
  resolveMotionPreference,
  type ResolvedGalaxyMotion,
} from './environment';
import {
  resolveEdgeRenderMode,
  resolveNodeSizeScale,
  type EdgeRenderMode,
  type GalaxyGraphThemeInput,
  type GalaxyPlanetSizingOptions,
} from './rendererConfig';
import type {
  AppliedRendererState,
  CameraCommand,
  CoreState,
  GalaxyRenderer,
  GalaxyRendererCallbacks,
  GalaxyRendererOptions,
  MutableRef,
  SceneCallbacks,
  SceneRuntime,
} from './rendererTypes';
import type { GalaxySceneFailure, GalaxySceneFailureReason } from './sceneFallback';
import { getSceneRebuildKey } from './sceneData';

export type SceneFactory = <NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLDivElement,
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  initialActiveGroup: string | null,
  initialShowClusters: boolean,
  initialGalaxyMode: boolean,
  initialMotion: ResolvedGalaxyMotion,
  edgeRenderMode: EdgeRenderMode,
  layoutInput: GraphLayoutInput | undefined,
  accessorsInput: GraphAccessors<NMeta, EMeta> | undefined,
  nodeSizeScale: number,
  planetSizingInput: GalaxyPlanetSizingOptions | undefined,
  initialTheme: GalaxyGraphThemeInput | undefined,
  callbacksRef: MutableRef<SceneCallbacks<NMeta, EMeta>>,
  pausedRef: MutableRef<boolean>,
  onContextLost: (failure: GalaxySceneFailure) => void,
) => SceneRuntime<NMeta, EMeta>;

function withContextReservation<NMeta, EMeta>(runtime: SceneRuntime<NMeta, EMeta>, release: () => void) {
  let disposed = false;
  return {
    ...runtime,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        runtime.dispose();
      } finally {
        release();
      }
    },
  };
}

function noop() {
  return undefined;
}

function resolveRendererCallbacks<NMeta, EMeta>(
  callbacks?: GalaxyRendererCallbacks<NMeta, EMeta>,
): SceneCallbacks<NMeta, EMeta> {
  return {
    onCameraViewChange: callbacks?.onCameraViewChange,
    onHoverEdge: callbacks?.onHoverEdge ?? noop,
    onHoverNode: callbacks?.onHoverNode ?? noop,
    onHoverNodeAnchor: callbacks?.onHoverNodeAnchor,
    onSelectEdge: callbacks?.onSelectEdge ?? noop,
    onSelectNode: callbacks?.onSelectNode ?? noop,
  };
}

function applyCameraCommand<NMeta, EMeta>(
  runtime: SceneRuntime<NMeta, EMeta> | null,
  cameraCommand: CameraCommand | null,
) {
  if (!cameraCommand || !runtime) return;
  if (cameraCommand.type === 'reset') runtime.resetCamera();
  if (cameraCommand.type === 'focus' && cameraCommand.nodeId) runtime.focusNode(cameraCommand.nodeId);
  if (cameraCommand.type === 'focus-edge' && cameraCommand.edgeId) runtime.focusEdge(cameraCommand.edgeId);
  if (cameraCommand.type === 'move' && cameraCommand.direction) runtime.moveCamera(cameraCommand.direction, 1.75);
}

function clearSceneDom(host: HTMLDivElement) {
  Array.from(host.children).forEach((child) => {
    if (child.tagName === 'CANVAS' || child.classList.contains('scene-labels')) child.remove();
  });
}

function getLayoutKey(layout?: GraphLayoutInput) {
  if (layout === false) return 'off';
  if (!layout) return 'auto';

  return JSON.stringify({
    clusterRadius: layout.clusterRadius,
    preserveExistingPositions: layout.preserveExistingPositions,
    seed: layout.seed,
    spacing: layout.spacing,
    strategy: layout.strategy,
  });
}

function getRendererSceneKey<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  options: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
) {
  return getSceneRebuildKey(options.dataset, getLayoutKey(options.layout));
}

function isAppendOnlyDatasetChange<NMeta, EMeta, CMeta>(
  prev: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
  next: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
): boolean {
  if (getLayoutKey(prev.layout) !== getLayoutKey(next.layout)) return false;
  const layout = next.layout;
  const preservesPositions = layout === false ? true : (layout?.preserveExistingPositions ?? true);
  if (!preservesPositions) return false;

  const prevNodes = prev.dataset.nodes;
  const nextNodes = next.dataset.nodes;
  const prevEdges = prev.dataset.edges;
  const nextEdges = next.dataset.edges;
  const prevClusters = prev.dataset.clusters ?? [];
  const nextClusters = next.dataset.clusters ?? [];

  if (prevClusters.length !== nextClusters.length) return false;
  for (let index = 0; index < prevClusters.length; index += 1) {
    if (prevClusters[index] !== nextClusters[index]) return false;
  }

  if (nextNodes.length < prevNodes.length || nextEdges.length < prevEdges.length) return false;
  if (nextNodes.length === prevNodes.length && nextEdges.length === prevEdges.length) return false;
  for (let index = 0; index < prevNodes.length; index += 1) {
    if (prevNodes[index] !== nextNodes[index]) return false;
  }
  for (let index = 0; index < prevEdges.length; index += 1) {
    if (prevEdges[index] !== nextEdges[index]) return false;
  }
  return true;
}

function reportRendererFailure<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLElement,
  state: CoreState<NMeta, EMeta, CMeta>,
  reason: GalaxySceneFailureReason,
  message: string,
  error?: unknown,
) {
  const nextFailure: GalaxySceneFailure = { reason, message, error };
  try {
    state.runtime?.dispose();
  } finally {
    state.runtime = null;
    clearSceneDom(host as HTMLDivElement);
    state.callbacks.onSceneFailure?.(nextFailure);
  }
}

function configureMotion<NMeta = unknown, EMeta = unknown, CMeta = unknown>(state: CoreState<NMeta, EMeta, CMeta>) {
  state.motionCleanup?.();
  state.motionCleanup = null;
  const motionPreference = state.options.motionPreference ?? 'system';
  state.resolvedMotion = resolveMotionPreference(motionPreference);
  state.pausedRef.current = Boolean(state.options.paused) || state.resolvedMotion === 'reduced';
  state.runtime?.updateMotionPreference(state.resolvedMotion);

  if (motionPreference !== 'system' || !canUseDOM() || typeof window.matchMedia !== 'function') {
    return;
  }

  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handleChange = (event: MediaQueryListEvent) => {
    state.resolvedMotion = event.matches ? 'reduced' : 'full';
    state.pausedRef.current = Boolean(state.options.paused) || state.resolvedMotion === 'reduced';
    state.runtime?.updateMotionPreference(state.resolvedMotion);
  };
  if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', handleChange);
  else mediaQuery.addListener?.(handleChange);

  state.motionCleanup = () => {
    if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', handleChange);
    else mediaQuery.removeListener?.(handleChange);
  };
}

function snapshotAppliedState<NMeta, EMeta, CMeta>(
  state: CoreState<NMeta, EMeta, CMeta>,
  overrides?: Partial<AppliedRendererState<NMeta, EMeta>>,
): AppliedRendererState<NMeta, EMeta> {
  return {
    accessors: state.options.accessors,
    activeGroup: state.options.activeGroup,
    galaxyMode: state.options.galaxyMode,
    nodeSizeScale: state.options.nodeSizeScale,
    planetSizing: state.options.planetSizing,
    resolvedMotion: state.resolvedMotion,
    selectedEdgeId: state.options.selectedEdgeId,
    selectedNodeId: state.options.selectedNodeId,
    showClusters: state.options.showClusters,
    theme: state.options.theme,
    ...overrides,
  };
}

function patchRuntime<NMeta = unknown, EMeta = unknown, CMeta = unknown>(state: CoreState<NMeta, EMeta, CMeta>) {
  const runtime = state.runtime;
  if (!runtime) return;

  const applied = state.appliedOptions;
  const next = state.options;

  if (!applied || applied.activeGroup !== next.activeGroup) runtime.updateActiveGroup(next.activeGroup);
  if (!applied || applied.showClusters !== next.showClusters) runtime.updateClusterVisibility(next.showClusters);
  if (!applied || applied.galaxyMode !== next.galaxyMode) runtime.updateGalaxyMode(next.galaxyMode);
  if (!applied || applied.resolvedMotion !== state.resolvedMotion) runtime.updateMotionPreference(state.resolvedMotion);
  if (!applied || applied.nodeSizeScale !== next.nodeSizeScale) runtime.updateNodeSizeScale(next.nodeSizeScale);
  if (!applied || applied.planetSizing !== next.planetSizing) runtime.updatePlanetSizing(next.planetSizing);
  if (!applied || applied.accessors !== next.accessors) runtime.updateAccessors(next.accessors);
  if (!applied || applied.theme !== next.theme) runtime.updateTheme(next.theme);
  if (!applied || applied.selectedNodeId !== next.selectedNodeId || applied.selectedEdgeId !== next.selectedEdgeId) {
    runtime.updateSelection(next.selectedNodeId, next.selectedEdgeId);
  }

  state.appliedOptions = snapshotAppliedState(state);

  const nonce = next.cameraCommand?.nonce ?? null;
  if (nonce !== null && nonce !== state.lastCameraCommandNonce) {
    applyCameraCommand(runtime, next.cameraCommand);
    state.lastCameraCommandNonce = nonce;
  }
  if (nonce === null) state.lastCameraCommandNonce = null;
}

function rebuildRenderer<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLElement,
  state: CoreState<NMeta, EMeta, CMeta>,
  createScene: SceneFactory,
) {
  if (state.disposed) return;

  state.runtime?.dispose();
  state.runtime = null;
  state.appliedOptions = null;
  clearSceneDom(host as HTMLDivElement);

  if (!canUseDOM()) return;

  const availability = detectWebGLAvailability();
  if (!availability.available) {
    reportRendererFailure(
      host,
      state,
      'webgl-unavailable',
      availability.message ?? 'WebGL is not available in this browser or device.',
    );
    return;
  }

  const contextLimit = state.options.contextLimit;
  const releaseContext = reserveGalaxyRendererContext(contextLimit);
  if (!releaseContext) {
    const budget = getGalaxyRendererContextBudget(contextLimit);
    state.callbacks.onContextBudgetExceeded?.(budget);
    reportRendererFailure(
      host,
      state,
      'webgl-unavailable',
      `Galaxy Nodes already has ${budget.active} active WebGL renderer contexts, which reaches its supported limit of ${budget.limit}. Unmount an inactive graph or reuse a single renderer before mounting another scene.`,
    );
    return;
  }

  try {
    state.runtime = withContextReservation(
      createScene(
        host as HTMLDivElement,
        state.options.dataset,
        state.options.activeGroup,
        state.options.showClusters,
        state.options.galaxyMode,
        state.resolvedMotion,
        resolveEdgeRenderMode(
          state.options.dataset.nodes.length,
          state.options.dataset.edges.length,
          state.options.expectedSize,
          state.options.renderMode,
        ),
        state.options.layout,
        state.options.accessors,
        resolveNodeSizeScale(state.options.nodeSizeScale),
        state.options.planetSizing,
        state.options.theme,
        state.callbacksRef,
        state.pausedRef,
        (nextFailure) => reportRendererFailure(host, state, nextFailure.reason, nextFailure.message, nextFailure.error),
      ),
      releaseContext,
    );
    state.appliedOptions = snapshotAppliedState(state, { selectedNodeId: null, selectedEdgeId: null });
    patchRuntime(state);
    state.callbacks.onSceneReady?.();
  } catch (error) {
    releaseContext();
    reportRendererFailure(
      host,
      state,
      'scene-error',
      error instanceof Error ? error.message : 'The graph scene could not be initialized.',
      error,
    );
  }
}

export function createGalaxyRendererController<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLElement,
  options: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
  callbacks: GalaxyRendererCallbacks<NMeta, EMeta>,
  createScene: SceneFactory,
): GalaxyRenderer<NMeta, EMeta, CMeta> {
  const state: CoreState<NMeta, EMeta, CMeta> = {
    appliedOptions: null,
    callbacks,
    callbacksRef: { current: resolveRendererCallbacks(callbacks) },
    disposed: false,
    lastCameraCommandNonce: null,
    motionCleanup: null,
    options,
    pausedRef: { current: Boolean(options.paused) },
    runtime: null,
    sceneKey: getRendererSceneKey(options),
    resolvedMotion: resolveMotionPreference(options.motionPreference),
  };

  configureMotion(state);
  rebuildRenderer(host, state, createScene);

  return {
    focusEdge: (edgeId) => state.runtime?.focusEdge(edgeId),
    focusNode: (nodeId) => state.runtime?.focusNode(nodeId),
    moveCamera: (direction: SpaceDirection, multiplier?: number) => state.runtime?.moveCamera(direction, multiplier),
    resetCamera: () => state.runtime?.resetCamera(),
    retry: () => {
      rebuildRenderer(host, state, createScene);
    },
    update: (nextOptions, nextCallbacks) => {
      if (state.disposed) return;
      const prevOptions = state.options;
      state.options = nextOptions;
      if (nextCallbacks) {
        state.callbacks = nextCallbacks;
        state.callbacksRef.current = resolveRendererCallbacks(nextCallbacks);
      }
      configureMotion(state);

      const nextSceneKey = getRendererSceneKey(nextOptions);
      if (nextSceneKey !== state.sceneKey) {
        if (state.runtime && isAppendOnlyDatasetChange(prevOptions, nextOptions)) {
          try {
            state.runtime.appendDataset(nextOptions.dataset);
            state.sceneKey = nextSceneKey;
            state.pausedRef.current = Boolean(nextOptions.paused) || state.resolvedMotion === 'reduced';
            patchRuntime(state);
            return;
          } catch {
            // Fall back to a full rebuild if the incremental path cannot apply.
          }
        }
        state.sceneKey = nextSceneKey;
        rebuildRenderer(host, state, createScene);
        return;
      }

      state.pausedRef.current = Boolean(nextOptions.paused) || state.resolvedMotion === 'reduced';
      patchRuntime(state);
    },
    dispose: () => {
      if (state.disposed) return;
      state.disposed = true;
      state.motionCleanup?.();
      state.motionCleanup = null;
      state.runtime?.dispose();
      state.runtime = null;
      clearSceneDom(host as HTMLDivElement);
    },
  };
}
