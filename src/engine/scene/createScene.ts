import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { resolveAccessors } from '../../domain/data';
import { type ResolvedGalaxyMotion } from '../environment';
import { resolveGraphLayout, type GraphLayoutInput } from '../../domain/layout';
import { buildSceneNodeIndex, buildNodeDegrees, type SceneNodeIndex } from '../sceneData';
import type { GalaxySceneFailure } from '../sceneFallback';
import type {
  GraphAccessors,
  GraphCluster,
  GraphDataset,
  GraphEdge,
  GraphNode,
  ResolvedAccessors,
  SpaceDirection,
} from '../../domain/types';
import {
  SELECTED_NODE_RELATIONSHIP_LABEL_LIMIT,
  MAX_PIXEL_RATIO,
  TONE_MAPPING_EXPOSURE,
  FOG_DENSITY_GALAXY,
  FOG_DENSITY_DEFAULT,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CONTROLS_DAMPING_FACTOR,
  CONTROLS_ROTATE_SPEED,
  CONTROLS_PAN_SPEED,
  CONTROLS_ZOOM_SPEED,
  CONTROLS_MIN_DISTANCE,
  CONTROLS_MAX_DISTANCE,
  AMBIENT_LIGHT_INTENSITY,
  KEY_LIGHT_INTENSITY,
  KEY_LIGHT_DISTANCE,
  RIM_LIGHT_INTENSITY,
  RIM_LIGHT_DISTANCE,
  FOCUS_FOG_DENSITY_MULTIPLIER,
  CLUSTER_ENDPOINT_MIN_RADIUS,
  CLUSTER_ENDPOINT_RADIUS_FACTOR,
  EDGE_MIDPOINT_LERP,
  HOVER_LABEL_MIN_HEIGHT,
  HOVER_LABEL_HEIGHT_FACTOR,
  WORLD_ROTATION_SPEED,
  FOCUS_NODE_OFFSET_X_SCALE,
  FOCUS_NODE_OFFSET_X_BASE,
  FOCUS_NODE_OFFSET_Y_SCALE,
  FOCUS_NODE_OFFSET_Y_BASE,
  FOCUS_NODE_OFFSET_Z_SCALE,
  FOCUS_NODE_OFFSET_Z_BASE,
} from '../sceneConstants';
import {
  galaxyGraphThemeCssVariables,
  resolveGalaxyGraphTheme,
  resolveNodeSizeScale,
  resolvePlanetSizing,
  type EdgeRenderMode,
  type GalaxyGraphThemeInput,
  type GalaxyPlanetSizingOptions,
} from '../rendererConfig';
import type {
  GalaxyNodeHoverAnchor,
  GalaxyFocusModelOptions,
  GalaxyVisibilityModelOptions,
  FocusPathResult,
  GraphCameraState,
  GraphUxEvent,
  GraphUxVariant,
  MutableRef,
  SceneCallbacks,
  SceneRuntime,
  PathFocusType,
} from '../rendererTypes';
import { projectGraphVisibility, type GalaxyViewMode, type GalaxyVisibilityProjection } from '../visibilityModel';
import {
  focusedNodeId as focusStateNodeId,
  reduceFocusState,
  type FocusEvent,
  type FocusState,
} from './focusStateMachine';
import { selectedEdgeLabelPosition } from '../edges';
import {
  edgeDisplayLabel,
  makeSceneLabel,
  nodeDisplayLabel,
  selectedEdgeDisplayLabel,
  setLabelPosition,
  setSceneLabel,
} from '../labels';
import type { EdgeEndpoints, EdgeVisualState, SceneEdgeEndpoint, SceneLabel } from '../sceneTypes';
import { resolveEndpoint } from './endpoints';
import { createNodeSizing } from './nodeSizing';
import { createCompositor } from './compositor';
import { createStarfield } from './starfield';
import { createClusterLayer } from './clusterLayer';
import { createPointLayer } from './pointLayer';
import { createSelectionModel } from './selectionModel';
import { createMarkerLayer } from './markerLayer';
import { createPlanetOverlay } from './planetOverlay';
import type { NodeSelectionHighlight, SelectionState } from './sceneContext';
import { createEdgeLayer } from './edgeLayer';
import { createPicking } from './picking';
import { createCameraController } from './cameraController';

const CAMERA_HOME = new THREE.Vector3(120, 430, 1540);
const TARGET_HOME = new THREE.Vector3(0, 0, 0);
const DEFAULT_UX_VARIANT: GraphUxVariant = 'baseline';
const ZOOM_DISTANCE_EPSILON = 0.5;
const DEFAULT_FOCUS_CAMERA_DURATION_MS = 550;
const DEFAULT_FOCUS_DATA_TIMEOUT_MS = 450;
const DEFAULT_FOCUS_PRIMARY_NEIGHBORS = 5;
const DEFAULT_FOCUS_EXPANDED_NEIGHBORS = 25;
const DEFAULT_FOCUS_SECOND_HOP_NEIGHBORS = 40;
const tmpVector = new THREE.Vector3();
const tmpCameraLookMatrix = new THREE.Matrix4();
const tmpCameraQuaternion = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

interface ResolvedFocusModel {
  cameraDurationMs: number;
  dataTimeoutMs: number;
  enabled: boolean;
  maxExpandedNeighbors: number;
  maxPrimaryNeighbors: number;
  maxSecondHopNeighbors: number;
  variant: GraphUxVariant;
}

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

interface CameraJob {
  completedEvent: FocusEvent;
  control: THREE.Vector3;
  durationMs: number;
  from: CameraPose;
  kind: 'focus' | 'unfocus' | 'recenter' | 'back';
  nodeId?: string;
  startedAt: number;
  telemetryStartedAt?: number;
  to: CameraPose;
}

function resolveFocusModel(
  focusModel: GalaxyFocusModelOptions | undefined,
  uxVariant: GraphUxVariant,
): ResolvedFocusModel {
  const variant = focusModel?.variant ?? uxVariant;
  return {
    cameraDurationMs: Math.max(0, focusModel?.cameraDurationMs ?? DEFAULT_FOCUS_CAMERA_DURATION_MS),
    dataTimeoutMs: Math.max(0, focusModel?.dataTimeoutMs ?? DEFAULT_FOCUS_DATA_TIMEOUT_MS),
    enabled: focusModel?.enabled ?? variant !== 'baseline',
    maxExpandedNeighbors: Math.max(1, focusModel?.maxExpandedNeighbors ?? DEFAULT_FOCUS_EXPANDED_NEIGHBORS),
    maxPrimaryNeighbors: Math.max(1, focusModel?.maxPrimaryNeighbors ?? DEFAULT_FOCUS_PRIMARY_NEIGHBORS),
    maxSecondHopNeighbors: Math.max(0, focusModel?.maxSecondHopNeighbors ?? DEFAULT_FOCUS_SECOND_HOP_NEIGHBORS),
    variant,
  };
}

export function createScene<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLDivElement,
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  initialActiveGroup: string | null,
  initialShowClusters: boolean,
  initialGalaxyMode: boolean,
  initialMotion: ResolvedGalaxyMotion,
  edgeRenderMode: EdgeRenderMode,
  layoutInput: GraphLayoutInput | undefined,
  accessorsInput: GraphAccessors<NMeta, EMeta> | undefined,
  initialNodeSizeScale: number,
  planetSizingInput: GalaxyPlanetSizingOptions | undefined,
  initialTheme: GalaxyGraphThemeInput | undefined,
  initialUxVariant: GraphUxVariant | undefined,
  initialFocusModel: GalaxyFocusModelOptions | undefined,
  initialVisibilityModel: GalaxyVisibilityModelOptions<NMeta, EMeta> | undefined,
  callbacksRef: MutableRef<SceneCallbacks<NMeta, EMeta>>,
  pausedRef: MutableRef<boolean>,
  onContextLost: (failure: GalaxySceneFailure) => void,
): SceneRuntime<NMeta, EMeta> {
  let activeGroup = initialActiveGroup;
  let showClusters = initialShowClusters;
  let galaxyMode = initialGalaxyMode;
  let motion = initialMotion;
  // Single mutable source of truth for selection/hover, shared by reference with the
  // point/planet/edge layers so they read current state without per-call snapshots.
  const selection: SelectionState = {
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeHighlight: null,
    selectedEdgeHighlight: null,
    hoveredNodeId: null,
    hoveredEdgeId: null,
    focusMode: 'none',
    pathEdgeIds: new Set(),
    pathNodeIds: new Set(),
    visibility: undefined,
  };
  let theme = resolveGalaxyGraphTheme(initialTheme);
  let accessors = resolveAccessors(accessorsInput);
  let nodeSizeScale = initialNodeSizeScale;
  let planetSizing = resolvePlanetSizing(planetSizingInput);
  let uxVariant = initialUxVariant ?? DEFAULT_UX_VARIANT;
  let focusModelInput = initialFocusModel;
  let focusModel = resolveFocusModel(focusModelInput, uxVariant);
  let visibilityModelInput = initialVisibilityModel;
  let focusState: FocusState = { name: 'idle' };
  let focusedClusterId: string | null = null;
  let lastVisibilityMode: GalaxyViewMode = 'default';
  let lastVisibilityProjectionKey = '';
  const focusHistory: string[] = [];
  let dataTimeoutId: number | null = null;
  let cameraState: GraphCameraState = 'idle';
  let programmaticCameraChangeDepth = 0;
  let userControlActive = false;
  let userControlPanOrOrbitEmitted = false;
  let keyboardCameraActive = false;
  let sceneDisposed = false;
  // Render-on-demand flag. The animation loop only submits a frame when something
  // actually changed (camera moved, hover/selection updated, data appended), unless
  // full-motion ambient animation is running. Starts true so the first frame paints.
  let needsRender = true;
  let hasActivePulse = false;
  let bloomActive = false;
  let pulseTime = 0;
  let lastPulseTimestamp = performance.now();
  const graphLayout = resolveGraphLayout(dataset, layoutInput);
  // Reassignable because incremental append (see appendDataset) recomputes them
  // when streamed nodes/edges arrive.
  let nodeIndex: SceneNodeIndex<NMeta> = buildSceneNodeIndex(dataset.nodes);
  let nodeDegrees = buildNodeDegrees(dataset);
  const hostThemePreviousVariables = new Map<string, { priority: string; value: string } | null>();

  function setHostThemeVariable(name: string, value: string) {
    if (!hostThemePreviousVariables.has(name)) {
      const previousValue = host.style.getPropertyValue(name);
      hostThemePreviousVariables.set(
        name,
        previousValue ? { priority: host.style.getPropertyPriority(name), value: previousValue } : null,
      );
    }
    host.style.setProperty(name, value);
  }

  function applyHostThemeStyle() {
    const variables = galaxyGraphThemeCssVariables(theme);
    Object.entries(variables).forEach(([name, value]) => setHostThemeVariable(name, value));
  }

  applyHostThemeStyle();

  function outputToneMapping() {
    return theme.scene.toneMapping === 'none' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  }

  const labelsRoot = document.createElement('div');
  labelsRoot.className = 'scene-labels';
  host.appendChild(labelsRoot);

  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height);
  renderer.setClearColor(theme.background, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(theme.scene.fogColor, focusFogDensity(false));

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.copy(CAMERA_HOME);

  let refreshBloomActive: (() => void) | null = null;
  const compositor = createCompositor({
    renderer,
    scene,
    camera,
    width,
    height,
    onBloomLayerChange: () => refreshBloomActive?.(),
  });
  compositor.setToneMapping(outputToneMapping());
  const setBloomLayer = compositor.setBloomLayer;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = CONTROLS_DAMPING_FACTOR;
  controls.rotateSpeed = CONTROLS_ROTATE_SPEED;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.panSpeed = CONTROLS_PAN_SPEED;
  controls.zoomSpeed = CONTROLS_ZOOM_SPEED;
  controls.minDistance = CONTROLS_MIN_DISTANCE;
  controls.maxDistance = CONTROLS_MAX_DISTANCE;
  controls.target.copy(TARGET_HOME);

  const selectionFocusPosition = new THREE.Vector3();

  function emitGraphUxEvent(event: GraphUxEvent) {
    callbacksRef.current.onGraphUxEvent?.(event);
  }

  function focusedNodePayload() {
    return selection.selectedNodeId ? { focusedNodeId: selection.selectedNodeId } : {};
  }

  function currentZoomDistance() {
    return camera.position.distanceTo(controls.target);
  }

  let lastControlZoomDistance = currentZoomDistance();

  function emitPanOrOrbit() {
    if (selection.selectedNodeId && cameraState !== 'moving') cameraState = 'orbit';
    if (focusModel.enabled && focusModel.variant !== 'baseline') dispatchFocusEvent({ type: 'USER_ORBIT_OR_ZOOM' });
    emitGraphUxEvent({
      type: 'pan_or_orbit',
      timestampMs: performance.now(),
      ...focusedNodePayload(),
    });
  }

  function emitZoomChanged(zoomDistance: number) {
    if (selection.selectedNodeId && cameraState !== 'moving') cameraState = 'orbit';
    if (focusModel.enabled && focusModel.variant !== 'baseline') dispatchFocusEvent({ type: 'USER_ORBIT_OR_ZOOM' });
    emitGraphUxEvent({
      type: 'zoom_changed',
      timestampMs: performance.now(),
      zoomDistance,
      ...focusedNodePayload(),
    });
  }

  function runProgrammaticCameraChange(fn: () => void) {
    programmaticCameraChangeDepth += 1;
    try {
      fn();
    } finally {
      lastControlZoomDistance = currentZoomDistance();
      programmaticCameraChangeDepth -= 1;
    }
  }

  let activeCameraJob: CameraJob | null = null;

  function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
  }

  function easeInOutCubic(value: number) {
    const x = clamp01(value);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function quadraticBezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number) {
    const u = 1 - t;
    return tmpVector
      .copy(a)
      .multiplyScalar(u * u)
      .addScaledVector(b, 2 * u * t)
      .addScaledVector(c, t * t);
  }

  function currentCameraPose(): CameraPose {
    return { position: camera.position.clone(), target: controls.target.clone() };
  }

  function applyCameraPose(position: THREE.Vector3, target: THREE.Vector3) {
    camera.position.copy(position);
    controls.target.copy(target);
    tmpCameraLookMatrix.lookAt(camera.position, target, WORLD_UP);
    tmpCameraQuaternion.setFromRotationMatrix(tmpCameraLookMatrix);
    camera.quaternion.copy(tmpCameraQuaternion);
    controls.update();
    cameraController.emitView();
    needsRender = true;
  }

  function targetForNode(nodeId: string): CameraPose | null {
    const node = nodeLookup.get(nodeId);
    const position = node ? nodePositions.get(node.id) : undefined;
    if (!node || !position) return null;

    const target = new THREE.Vector3(position.x, position.y, position.z).applyQuaternion(world.quaternion);
    const nodeSize = Math.max(accessors.nodeSize(node), planetRadius(node));
    const positionOffset = new THREE.Vector3(
      nodeSize * FOCUS_NODE_OFFSET_X_SCALE + FOCUS_NODE_OFFSET_X_BASE,
      nodeSize * FOCUS_NODE_OFFSET_Y_SCALE + FOCUS_NODE_OFFSET_Y_BASE,
      nodeSize * FOCUS_NODE_OFFSET_Z_SCALE + FOCUS_NODE_OFFSET_Z_BASE,
    );
    return { position: target.clone().add(positionOffset), target };
  }

  function targetForCluster(clusterId: string): CameraPose | null {
    const cluster = graphLayout.clusterLookup.get(clusterId);
    if (!cluster) return null;
    const target = new THREE.Vector3(cluster.center.x, cluster.center.y, cluster.center.z).applyQuaternion(
      world.quaternion,
    );
    const positionOffset = new THREE.Vector3(
      cluster.radius * 0.45 + FOCUS_NODE_OFFSET_X_BASE,
      cluster.radius * 0.24 + FOCUS_NODE_OFFSET_Y_BASE,
      cluster.radius * 2.4 + FOCUS_NODE_OFFSET_Z_BASE,
    );
    return { position: target.clone().add(positionOffset), target };
  }

  function homePose(): CameraPose {
    return { position: CAMERA_HOME.clone(), target: TARGET_HOME.clone() };
  }

  function startCameraJob(
    kind: CameraJob['kind'],
    to: CameraPose,
    completedEvent: FocusEvent,
    options: { nodeId?: string; telemetryStartedAt?: number } = {},
  ) {
    const from = currentCameraPose();
    const midpoint = from.position.clone().lerp(to.position, 0.5);
    const arcHeight = Math.max(20, Math.min(260, from.position.distanceTo(to.position) * 0.18));
    const control = midpoint.add(WORLD_UP.clone().multiplyScalar(arcHeight));
    activeCameraJob = {
      completedEvent,
      control,
      durationMs: focusModel.cameraDurationMs,
      from,
      kind,
      nodeId: options.nodeId,
      startedAt: performance.now(),
      telemetryStartedAt: options.telemetryStartedAt,
      to,
    };
    cameraState = 'moving';
    needsRender = true;
  }

  function settleCameraJob(job: CameraJob) {
    runProgrammaticCameraChange(() => applyCameraPose(job.to.position, job.to.target));
    activeCameraJob = null;
    dispatchFocusEvent(job.completedEvent);
    if (job.telemetryStartedAt && job.nodeId) {
      const completedAt = performance.now();
      emitGraphUxEvent({
        type: 'focus_completed',
        nodeId: job.nodeId,
        timestampMs: completedAt,
        durationMs: completedAt - job.telemetryStartedAt,
        visibleNodeCount: pointLayer.visibleCount(),
        visibleEdgeCount: edgeLayer.visibleCount(),
      });
    }
  }

  function tickCameraJob() {
    const job = activeCameraJob;
    if (!job) return false;

    const elapsed = performance.now() - job.startedAt;
    const t = job.durationMs <= 0 ? 1 : clamp01(elapsed / job.durationMs);
    const eased = easeInOutCubic(t);
    const nextPosition = quadraticBezier(job.from.position, job.control, job.to.position, eased).clone();
    const nextTarget = job.from.target.clone().lerp(job.to.target, eased);
    runProgrammaticCameraChange(() => applyCameraPose(nextPosition, nextTarget));
    if (t >= 1) settleCameraJob(job);
    return true;
  }

  scene.add(new THREE.AmbientLight(0x96ffe2, AMBIENT_LIGHT_INTENSITY));
  const keyLight = new THREE.PointLight(0xffffff, KEY_LIGHT_INTENSITY, KEY_LIGHT_DISTANCE);
  keyLight.position.set(-260, 520, 680);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x54ffe0, RIM_LIGHT_INTENSITY, RIM_LIGHT_DISTANCE);
  rimLight.position.set(620, -120, -420);
  scene.add(rimLight);

  const world = new THREE.Group();
  scene.add(world);

  host.tabIndex = 0;
  host.style.outline = 'none';

  const nodePositions = graphLayout.nodePositions;
  const nodeLookup = graphLayout.nodeLookup;
  const clusterDataLookup = new Map<string, GraphCluster>(graphLayout.clusters.map((cluster) => [cluster.id, cluster]));
  const clusterLookup = new Map<string, SceneEdgeEndpoint>(
    graphLayout.clusters.map((cluster) => [
      cluster.id,
      {
        group: cluster.group,
        id: cluster.id,
        isNode: false,
        label: cluster.label,
        position: new THREE.Vector3(cluster.center.x, cluster.center.y, cluster.center.z),
        radius: Math.max(CLUSTER_ENDPOINT_MIN_RADIUS, cluster.radius * CLUSTER_ENDPOINT_RADIUS_FACTOR),
      },
    ]),
  );
  const edgeLookup = new Map<string, GraphEdge<EMeta>>();
  const edgeEndpoints = new Map<string, EdgeEndpoints>();
  const edgeStates = new Map<string, EdgeVisualState<EMeta>>();
  const interactiveEdgeMeshes: THREE.Object3D[] = [];
  const clusterHitGeometry = new THREE.SphereGeometry(1, 16, 8);
  const clusterHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const interactiveClusterMeshes = graphLayout.clusters.map((cluster) => {
    const hit = new THREE.Mesh(clusterHitGeometry, clusterHitMaterial);
    hit.position.set(cluster.center.x, cluster.center.y, cluster.center.z);
    hit.scale.setScalar(Math.max(CLUSTER_ENDPOINT_MIN_RADIUS, cluster.radius));
    hit.visible = false;
    hit.userData.clusterId = cluster.id;
    hit.userData.pickable = true;
    hit.userData.type = 'cluster';
    world.add(hit);
    return hit;
  });

  const selectionModel = createSelectionModel<NMeta, EMeta>({
    nodeLookup,
    nodePositions,
    edgeEndpoints,
    edgeStates,
    nodeDegrees: () => nodeDegrees,
    accessors: () => accessors,
    selectedEdgeId: () => selection.selectedEdgeId,
  });
  const { indexSelectableEdge, getNodeSelectionHighlight, getEdgeSelectionHighlight, rankedHighlightNodeIds } =
    selectionModel;

  const pointLayer = createPointLayer<NMeta, EMeta>({
    world,
    nodes: () => dataset.nodes,
    nodePositions,
    accessors: () => accessors,
    theme: () => theme,
    activeGroup: () => activeGroup,
    selection,
    edgeEndpoints,
    galaxyMode,
    nodeSizeScale,
    pixelRatio: renderer.getPixelRatio(),
  });
  const updatePointVisibility = pointLayer.updateVisibility;
  const updatePointAppearance = pointLayer.updateAppearance;

  const starfield = createStarfield({ world, galaxyMode, theme: () => theme });

  const labels: SceneLabel[] = [];
  const selectedEdgeLabel = makeSceneLabel(labelsRoot, 'edge-label');
  labels.push(selectedEdgeLabel);
  const selectedRelationshipLabels = Array.from({ length: SELECTED_NODE_RELATIONSHIP_LABEL_LIMIT }, () => {
    const label = makeSceneLabel(labelsRoot, 'edge-label relationship-label');
    labels.push(label);
    return label;
  });
  const hoverLabel = makeSceneLabel(labelsRoot, 'hover-label');
  labels.push(hoverLabel);
  const clusterLayer = createClusterLayer({
    world,
    labelsRoot,
    labels,
    clusters: graphLayout.clusters,
    theme: () => theme,
    galaxyMode: () => galaxyMode,
    activeGroup: () => activeGroup,
    showClusters: () => showClusters,
    visibility: () => selection.visibility,
  });

  function updateClusterPickTargets() {
    const projection = selection.visibility;
    interactiveClusterMeshes.forEach((hit) => {
      const clusterId = hit.userData.clusterId as string | undefined;
      const cluster = clusterId ? graphLayout.clusterLookup.get(clusterId) : null;
      const visibleByGroup = activeGroup === null || cluster?.group === activeGroup;
      hit.userData.pickable =
        showClusters &&
        (projection ? Boolean(clusterId && projection.visibleClusterIds.has(clusterId)) : visibleByGroup);
    });
  }

  function updateClusterVisibility() {
    clusterLayer.updateVisibility();
    updateClusterPickTargets();
  }

  function focusFogDensity(hasSelection: boolean) {
    const baseDensity = (galaxyMode ? FOG_DENSITY_GALAXY : FOG_DENSITY_DEFAULT) * theme.scene.fogDensityScale;
    return hasSelection ? baseDensity * FOCUS_FOG_DENSITY_MULTIPLIER : baseDensity;
  }

  function applyFocusState(hasSelection: boolean, focusPosition: THREE.Vector3 | null) {
    const focusActive = hasSelection && Boolean(focusPosition);
    starfield.setFocusDim(hasSelection);
    clusterLayer.setFocusDim(hasSelection);
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = focusFogDensity(hasSelection);

    pointLayer.setFocus(focusActive, focusPosition);
    hasActivePulse = false;
    if (!hasSelection) {
      pulseTime = 0;
      pointLayer.resetPulse();
    }
  }

  const nodeSizing = createNodeSizing<NMeta, EMeta>({
    nodes: () => dataset.nodes,
    nodeDegrees: () => nodeDegrees,
    nodeIndex: () => nodeIndex,
    planetSizing: () => planetSizing,
    activeGroup: () => activeGroup,
    accessors: () => accessors,
  });
  const { planetRadius } = nodeSizing;
  const resolveNodeEndpoint = (id: string) =>
    resolveEndpoint(id, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius);
  const cameraController = createCameraController<NMeta, EMeta>({
    camera,
    controls,
    world,
    nodeLookup,
    nodePositions,
    edgeEndpoints,
    accessors: () => accessors,
    planetRadius,
    homePosition: CAMERA_HOME,
    homeTarget: TARGET_HOME,
    onCameraViewChange: (view) => {
      // Every camera change funnels through here (OrbitControls, keyboard pans,
      // and focus/reset), so it is the single choke point that wakes rendering.
      needsRender = true;
      callbacksRef.current.onCameraViewChange?.(view);
    },
  });
  const markerLayer = createMarkerLayer<NMeta, EMeta>({
    world,
    labelsRoot,
    labels,
    theme: () => theme,
    accessors: () => accessors,
    nodeLookup,
    resolveEndpoint: resolveNodeEndpoint,
    rankedHighlightNodeIds,
    setBloomLayer,
  });

  const planetOverlay = createPlanetOverlay<NMeta, EMeta>({
    world,
    labelsRoot,
    labels,
    renderer,
    nodePositions,
    edgeEndpoints,
    accessors: () => accessors,
    theme: () => theme,
    activeGroup: () => activeGroup,
    planetSizing: () => planetSizing,
    selection,
    nodeSizing,
  });
  const updateMajorOverlay = planetOverlay.update;

  const edgeLayer = createEdgeLayer<NMeta, EMeta>({
    world,
    edgeRenderMode,
    edgeLookup,
    edgeEndpoints,
    edgeStates,
    pickTargets: interactiveEdgeMeshes,
    nodeLookup,
    nodePositions,
    clusterLookup,
    accessors: () => accessors,
    activeGroup: () => activeGroup,
    galaxyMode: () => galaxyMode,
    theme: () => theme,
    planetRadius,
    selection,
    indexSelectableEdge,
  });

  function updateSelectedRelationshipLabels() {
    const edgeIds: string[] = [];

    selectedRelationshipLabels.forEach((label, index) => {
      const edgeId = edgeIds[index];
      const state = edgeId ? (edgeStates.get(edgeId) ?? null) : null;
      if (!state || !state.visible) {
        setSceneLabel(label, null, null);
        return;
      }

      setSceneLabel(
        label,
        edgeDisplayLabel(state.edge, accessors as ResolvedAccessors<unknown, EMeta>),
        selectedEdgeLabelPosition(state, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode),
      );
    });
  }

  dataset.edges.forEach(edgeLayer.addEdge);

  function resolveAppendedNodePositions(nextDataset: GraphDataset<NMeta, EMeta>, newNodes: GraphNode<NMeta>[]) {
    // Feed every already-placed node back in as an authored position so re-running
    // layout only generates coordinates for the appended nodes and never disturbs
    // what is already on screen (which would also invalidate existing edge tubes).
    const layoutNodes = nextDataset.nodes.map((node) => {
      if (node.position) return node;
      const resolved = nodePositions.get(node.id);
      return resolved ? { ...node, position: resolved } : node;
    });
    const layoutClusters: GraphCluster[] = graphLayout.clusters.map((cluster) => ({
      id: cluster.id,
      label: cluster.label,
      center: cluster.center,
      radius: cluster.radius,
      group: cluster.group,
      color: cluster.color,
    }));
    const resolved = resolveGraphLayout({ ...nextDataset, nodes: layoutNodes, clusters: layoutClusters }, layoutInput);
    for (const node of newNodes) {
      const position = resolved.nodePositions.get(node.id);
      if (!position) {
        throw new Error(`Galaxy Nodes could not resolve a position for appended node "${node.id}".`);
      }
      nodePositions.set(node.id, position);
      nodeLookup.set(node.id, node);
    }
  }

  // Incremental append: extend the scene in place when streamed/progressive loading
  // adds nodes and edges on top of the existing prefix, instead of disposing and
  // rebuilding every mesh (a cost that otherwise grows with the total graph size on
  // every chunk). Only the appended tail is built; existing meshes are untouched.
  function appendDataset(nextDataset: GraphDataset<NMeta, EMeta>) {
    const prevNodeCount = dataset.nodes.length;
    const prevEdgeCount = dataset.edges.length;
    if (nextDataset.nodes.length < prevNodeCount || nextDataset.edges.length < prevEdgeCount) {
      throw new Error('Galaxy Nodes incremental append requires a superset of the current dataset.');
    }

    const newNodes = nextDataset.nodes.slice(prevNodeCount);
    if (newNodes.length) resolveAppendedNodePositions(nextDataset, newNodes);

    dataset = nextDataset as GraphDataset<NMeta, EMeta, CMeta>;
    nodeIndex = buildSceneNodeIndex(dataset.nodes);
    nodeDegrees = buildNodeDegrees(dataset);
    nodeSizing.clearRankedCache();

    // Streamed growth can cross the density threshold, so the point layer also recomputes
    // the adaptive opacity scale from the new totals when it grows.
    if (newNodes.length) pointLayer.grow(prevNodeCount, dataset);

    for (let index = prevEdgeCount; index < dataset.edges.length; index += 1) {
      edgeLayer.addEdge(dataset.edges[index], index);
    }

    updatePointAppearance();
    edgeLayer.update();
    updateClusterVisibility();
    updateSelection(selection.selectedNodeId, selection.selectedEdgeId);
    updateHoverHighlight();
    needsRender = true;
  }

  refreshBloomActive = () => {
    bloomActive = markerLayer.anyVisible();
  };

  function updateHoverHighlight() {
    const hoveredEndpoint = selection.hoveredNodeId ? resolveNodeEndpoint(selection.hoveredNodeId) : null;
    markerLayer.updateHoverMarker(hoveredEndpoint);
    updateMajorOverlay();
    edgeLayer.applyAppearance();
  }

  function nodeHighlightOptions() {
    if (!focusModel.enabled || focusModel.variant !== 'fullFocus') return undefined;
    return {
      edgeLimit: selection.focusMode === 'expanded' ? focusModel.maxExpandedNeighbors : focusModel.maxPrimaryNeighbors,
      secondDegreeLimit: focusModel.maxSecondHopNeighbors,
    };
  }

  function visibilityModelEnabled() {
    return Boolean(visibilityModelInput?.enabled);
  }

  function visibilityModeForState(state: FocusState): GalaxyViewMode {
    if (!visibilityModelEnabled()) return 'default';
    if (state.name === 'pathFocus') return 'path';
    if (state.name === 'deepFocus') return 'deep';
    if (
      state.name === 'preFocus' ||
      state.name === 'loadingFocusData' ||
      state.name === 'focusingCamera' ||
      state.name === 'focusedPartial' ||
      state.name === 'focused' ||
      state.name === 'expandedFocus' ||
      state.name === 'orbitFocus'
    ) {
      return 'expanded';
    }
    return 'default';
  }

  function visibilityProjectionKey(projection: GalaxyVisibilityProjection) {
    return [
      projection.mode,
      projection.visibleNodeIds.size,
      projection.visibleEdgeIds.size,
      projection.visibleClusterIds.size,
      projection.overflow.hiddenNodeCount,
      projection.overflow.hiddenEdgeCount,
    ].join(':');
  }

  function refreshVisibilityProjection() {
    if (!visibilityModelEnabled()) {
      selection.visibility = undefined;
      lastVisibilityMode = 'default';
      lastVisibilityProjectionKey = '';
      return;
    }

    const projection = projectGraphVisibility({
      accessors,
      activeGroup,
      clusters: graphLayout.clusters,
      dataset,
      focusedClusterId,
      mode: visibilityModeForState(focusState),
      nodeDegrees,
      options: visibilityModelInput,
      pathEdgeIds: selection.pathEdgeIds,
      pathNodeIds: selection.pathNodeIds,
      selectedNodeId: selection.selectedNodeId ?? focusStateNodeId(focusState),
    });
    selection.visibility = projection;

    if (projection.mode !== lastVisibilityMode) {
      emitGraphUxEvent({
        type: 'view_mode_changed',
        focusedNodeId: focusStateNodeId(focusState) ?? undefined,
        from: lastVisibilityMode,
        timestampMs: performance.now(),
        to: projection.mode,
      });
      lastVisibilityMode = projection.mode;
    }

    const projectionKey = visibilityProjectionKey(projection);
    if (projectionKey !== lastVisibilityProjectionKey) {
      emitGraphUxEvent({
        type: 'visibility_projected',
        focusedNodeId: focusStateNodeId(focusState) ?? undefined,
        hiddenEdgeCount: projection.overflow.hiddenEdgeCount,
        hiddenNodeCount: projection.overflow.hiddenNodeCount,
        overflow: projection.overflow,
        timestampMs: performance.now(),
        viewMode: projection.mode,
        visibleEdgeCount: projection.visibleEdgeIds.size,
        visibleNodeCount: projection.visibleNodeIds.size,
      });
      lastVisibilityProjectionKey = projectionKey;
    }
  }

  function filterHighlightForVisibility(highlight: NodeSelectionHighlight | null) {
    const projection = selection.visibility;
    if (!projection || !highlight) return highlight;
    const filterNodeIds = (ids: Set<string>) =>
      new Set(Array.from(ids).filter((nodeId) => projection.visibleNodeIds.has(nodeId)));
    const filterEdgeIds = (ids: Set<string>) =>
      new Set(Array.from(ids).filter((edgeId) => projection.visibleEdgeIds.has(edgeId)));
    return {
      connectedEdgeIds: filterEdgeIds(highlight.connectedEdgeIds),
      firstDegreeNodeIds: filterNodeIds(highlight.firstDegreeNodeIds),
      secondDegreeNodeIds: filterNodeIds(highlight.secondDegreeNodeIds),
    };
  }

  function updateSelection(nextSelectedNodeId: string | null, nextSelectedEdgeId: string | null) {
    selection.selectedNodeId = nextSelectedNodeId;
    selection.selectedEdgeId = nextSelectedEdgeId;
    selection.selectedNodeHighlight = nextSelectedNodeId
      ? getNodeSelectionHighlight(nextSelectedNodeId, nodeHighlightOptions())
      : null;
    selection.selectedEdgeHighlight = nextSelectedEdgeId ? getEdgeSelectionHighlight(nextSelectedEdgeId) : null;
    const hasSelection = Boolean(nextSelectedNodeId || nextSelectedEdgeId);
    if (!hasSelection && cameraState !== 'moving') cameraState = 'idle';
    const selectedEndpoints = nextSelectedEdgeId ? (edgeEndpoints.get(nextSelectedEdgeId) ?? null) : null;
    const selectedEdgeState = nextSelectedEdgeId ? (edgeStates.get(nextSelectedEdgeId) ?? null) : null;
    const selectedNodeEndpoint = nextSelectedNodeId ? resolveNodeEndpoint(nextSelectedNodeId) : null;
    const primaryEndpoint = selectedEndpoints?.source ?? selectedNodeEndpoint;
    const secondaryEndpoint = selectedEndpoints?.target ?? null;
    pointLayer.setGlobalOpacity(hasSelection);
    const focusPosition = selectedEndpoints
      ? selectionFocusPosition
          .copy(selectedEndpoints.source.position)
          .lerp(selectedEndpoints.target.position, EDGE_MIDPOINT_LERP)
      : (selectedNodeEndpoint?.position ?? null);
    applyFocusState(hasSelection, focusPosition);
    refreshVisibilityProjection();
    selection.selectedNodeHighlight = filterHighlightForVisibility(selection.selectedNodeHighlight);
    selection.selectedEdgeHighlight = filterHighlightForVisibility(selection.selectedEdgeHighlight);

    updateClusterVisibility();
    updatePointVisibility();
    updateMajorOverlay();
    edgeLayer.updateVisibility();
    setSceneLabel(
      selectedEdgeLabel,
      selectedEdgeState
        ? selectedEdgeDisplayLabel(
            selectedEdgeState.edge,
            selectedEdgeState.endpoints,
            accessors as ResolvedAccessors<unknown, EMeta>,
          )
        : null,
      selectedEdgeState
        ? selectedEdgeLabelPosition(selectedEdgeState, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode)
        : null,
    );

    markerLayer.updateSelectionMarkers({
      primaryEndpoint,
      secondaryEndpoint,
      selectedNodeEndpoint,
      selectedNodeId: nextSelectedNodeId,
      selectedEndpoints,
      selectedNodeHighlight: selection.selectedNodeHighlight,
    });
    updateSelectedRelationshipLabels();
    edgeLayer.applyAppearance();
  }

  function clearFocusDataTimeout() {
    if (dataTimeoutId === null) return;
    window.clearTimeout(dataTimeoutId);
    dataTimeoutId = null;
  }

  function focusModeForState(state: FocusState) {
    if (!focusModel.enabled || focusModel.variant === 'baseline') return 'none' as const;
    if (focusModel.variant === 'cameraOnly') return 'cameraOnly' as const;
    if (state.name === 'expandedFocus') return 'expanded' as const;
    if (state.name === 'deepFocus') return 'deep' as const;
    if (state.name === 'pathFocus') return 'path' as const;
    if (state.name === 'orbitFocus') return 'orbit' as const;
    if (state.name === 'focusedPartial') return 'partial' as const;
    return 'fullFocus' as const;
  }

  function applyFocusStateSelection(state: FocusState) {
    selection.focusMode = focusModeForState(state);
    selection.pathNodeIds = state.name === 'pathFocus' ? new Set(state.path.nodeIds) : new Set();
    selection.pathEdgeIds = state.name === 'pathFocus' ? new Set(state.path.edgeIds) : new Set();
    updateSelection(selection.selectedNodeId, selection.selectedEdgeId);
  }

  function startFocusCamera(nodeId: string, kind: CameraJob['kind'] = 'focus') {
    const pose = targetForNode(nodeId);
    if (!pose) return;
    const startedAt = performance.now();
    emitGraphUxEvent({ type: 'focus_started', nodeId, timestampMs: startedAt, variant: focusModel.variant });
    startCameraJob(kind, pose, { type: 'CAMERA_SETTLED', nodeId }, { nodeId, telemetryStartedAt: startedAt });
  }

  function startClusterCamera(clusterId: string) {
    const pose = targetForCluster(clusterId);
    if (!pose) return;
    startCameraJob('focus', pose, { type: 'CANCEL' });
  }

  function startUnfocusCamera() {
    emitGraphUxEvent({
      type: 'camera_reset',
      timestampMs: performance.now(),
      ...focusedNodePayload(),
    });
    startCameraJob('unfocus', homePose(), { type: 'CAMERA_SETTLED' });
  }

  function dispatchFocusEvent(event: FocusEvent) {
    const previousState = focusState;
    const nextState = reduceFocusState(focusState, event);
    focusState = nextState;

    if (event.type !== 'FOCUS_DATA_MISSING') clearFocusDataTimeout();

    if (nextState.name !== previousState.name || focusStateNodeId(nextState) !== focusStateNodeId(previousState)) {
      cameraState =
        nextState.name === 'orbitFocus'
          ? 'orbit'
          : nextState.name === 'focusingCamera' ||
              nextState.name === 'unfocusing' ||
              nextState.name === 'navigatingBack'
            ? 'moving'
            : focusStateNodeId(nextState)
              ? 'focused'
              : 'idle';
    }

    if (event.type === 'FOCUS_DATA_MISSING' && nextState.name === 'loadingFocusData') {
      dataTimeoutId = window.setTimeout(() => {
        dispatchFocusEvent({ type: 'DATA_TIMEOUT', nodeId: nextState.nodeId });
      }, focusModel.dataTimeoutMs);
    }

    if (nextState.name === 'focusingCamera' && previousState.name !== 'focusingCamera') {
      startFocusCamera(nextState.nodeId);
    }

    if (nextState.name === 'focusedPartial' && previousState.name === 'loadingFocusData') {
      startFocusCamera(nextState.nodeId);
    }

    if (nextState.name === 'focused' && previousState.name === 'focusingCamera') {
      cameraState = 'focused';
    }

    if (nextState.name === 'navigatingBack' && previousState.name !== 'navigatingBack') {
      if (nextState.targetNodeId) {
        updateSelection(nextState.targetNodeId, null);
        startFocusCamera(nextState.targetNodeId, 'back');
      } else {
        startUnfocusCamera();
      }
    }

    if (nextState.name === 'unfocusing' && previousState.name !== 'unfocusing') {
      startUnfocusCamera();
    }

    if (nextState.name === 'idle' && previousState.name === 'unfocusing') {
      activeCameraJob = null;
      cameraState = 'idle';
      selection.focusMode = 'none';
      selection.pathNodeIds = new Set();
      selection.pathEdgeIds = new Set();
      updateSelection(null, null);
      callbacksRef.current.onSelectNode(null);
      callbacksRef.current.onSelectEdge(null);
    }

    applyFocusStateSelection(nextState);

    if (visibilityModelEnabled() && nextState.name === 'focused' && previousState.name === 'focusingCamera') {
      dispatchFocusEvent({ type: 'EXPAND_NEIGHBORS', depth: 1 });
    }
  }

  function beginNodeFocus(nodeId: string, dataReady = true) {
    if (!focusModel.enabled || focusModel.variant === 'baseline') {
      focusNodeWithTelemetry(nodeId);
      return;
    }

    const previousNodeId = focusStateNodeId(focusState);
    if (previousNodeId && previousNodeId !== nodeId) focusHistory.push(previousNodeId);
    focusedClusterId = null;
    activeCameraJob = null;
    updateSelection(nodeId, null);
    dispatchFocusEvent({ type: 'NODE_CLICK', nodeId, previousNodeId: previousNodeId ?? undefined });
    dispatchFocusEvent(
      dataReady
        ? { type: 'FOCUS_DATA_READY', nodeId }
        : { type: 'FOCUS_DATA_MISSING', nodeId, startedAt: performance.now() },
    );
  }

  function completeFocusData(nodeId: string) {
    if (focusState.name === 'loadingFocusData') dispatchFocusEvent({ type: 'DATA_READY', nodeId });
    else dispatchFocusEvent({ type: 'FOCUS_DATA_READY', nodeId });
  }

  function failFocusData(nodeId: string) {
    dispatchFocusEvent({ type: 'LOAD_FAILED', nodeId });
  }

  function navigateBackFocus() {
    const targetNodeId = focusHistory.pop();
    dispatchFocusEvent({ type: 'BACK', targetNodeId });
  }

  function clearHover() {
    setSceneLabel(hoverLabel, null, null);
    renderer.domElement.style.cursor = 'grab';
    selection.hoveredNodeId = null;
    selection.hoveredEdgeId = null;
    updateHoverHighlight();
    if (focusModel.enabled && focusModel.variant !== 'baseline') dispatchFocusEvent({ type: 'HOVER_END' });
    callbacksRef.current.onHoverNode(null);
    callbacksRef.current.onHoverNodeAnchor?.(null);
    callbacksRef.current.onHoverEdge(null);
  }

  function updateActiveGroup(nextActiveGroup: string | null) {
    activeGroup = nextActiveGroup;
    focusedClusterId = null;
    updateClusterVisibility();
    edgeLayer.updateVisibility();
    updateSelection(selection.selectedNodeId, selection.selectedEdgeId);
    clearHover();
  }

  function updateClusterVisibilityFromProp(nextShowClusters: boolean) {
    showClusters = nextShowClusters;
    updateClusterVisibility();
  }

  function updateGalaxyMode(nextGalaxyMode: boolean) {
    galaxyMode = nextGalaxyMode;
    pointLayer.setGalaxyMode(galaxyMode);
    if (scene.fog instanceof THREE.FogExp2)
      scene.fog.density = focusFogDensity(Boolean(selection.selectedNodeId || selection.selectedEdgeId));
    starfield.setGalaxyMode(galaxyMode);
    updateClusterVisibility();
    edgeLayer.update();
    updateSelection(selection.selectedNodeId, selection.selectedEdgeId);
    updateHoverHighlight();
  }

  function updateMotionPreference(nextMotion: ResolvedGalaxyMotion) {
    motion = nextMotion;
  }

  function updateNodeSizeScale(nextNodeSizeScale: number | undefined) {
    nodeSizeScale = resolveNodeSizeScale(nextNodeSizeScale);
    pointLayer.setNodeSizeScale(nodeSizeScale);
  }

  function updatePlanetSizing(nextPlanetSizing: GalaxyPlanetSizingOptions | undefined) {
    planetSizing = resolvePlanetSizing(nextPlanetSizing);
    updatePointAppearance();
    edgeLayer.update();
    updateSelection(selection.selectedNodeId, selection.selectedEdgeId);
    updateHoverHighlight();
  }

  function updateTheme(nextTheme: GalaxyGraphThemeInput | undefined) {
    theme = resolveGalaxyGraphTheme(nextTheme);
    applyHostThemeStyle();
    renderer.setClearColor(theme.background, 1);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(theme.scene.fogColor);
      scene.fog.density = focusFogDensity(Boolean(selection.selectedNodeId || selection.selectedEdgeId));
    }
    compositor.setToneMapping(outputToneMapping());
    starfield.setTheme();
    clusterLayer.setTheme();
    pointLayer.setTheme();
    markerLayer.setTheme();
    planetOverlay.setTheme();
    edgeLayer.setTheme();
    updateSelection(selection.selectedNodeId, selection.selectedEdgeId);
    updateHoverHighlight();
  }

  function updateUxVariant(nextUxVariant: GraphUxVariant | undefined) {
    uxVariant = nextUxVariant ?? DEFAULT_UX_VARIANT;
    focusModel = resolveFocusModel(focusModelInput, uxVariant);
    applyFocusStateSelection(focusState);
  }

  function updateFocusModel(nextFocusModel: GalaxyFocusModelOptions | undefined) {
    focusModelInput = nextFocusModel;
    focusModel = resolveFocusModel(focusModelInput, uxVariant);
    applyFocusStateSelection(focusState);
  }

  function updateVisibilityModel(nextVisibilityModel: GalaxyVisibilityModelOptions<NMeta, EMeta> | undefined) {
    visibilityModelInput = nextVisibilityModel;
    applyFocusStateSelection(focusState);
  }

  function updateAccessors(nextAccessors: GraphAccessors<NMeta, EMeta> | undefined) {
    accessors = resolveAccessors(nextAccessors);
    updatePointAppearance();
    edgeLayer.update();
    updateSelection(selection.selectedNodeId, selection.selectedEdgeId);
    updateHoverHighlight();
  }

  updatePointAppearance();
  updateClusterVisibility();
  edgeLayer.updateVisibility();
  updateSelection(null, null);

  const picking = createPicking<NMeta, EMeta>({
    renderer,
    camera,
    nodes: () => dataset.nodes,
    nodeLookup,
    edgeLookup,
    clusterLookup: clusterDataLookup,
    planetOverlay,
    pointLayer,
    edgePickTargets: () => interactiveEdgeMeshes,
    clusterPickTargets: () => interactiveClusterMeshes,
  });
  let animationFrame = 0;
  let frame = 0;
  const CLICK_SLOP_SQ = 36;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDownValid = false;
  let pendingHoverX = 0;
  let pendingHoverY = 0;
  let hoverPending = false;

  function resize() {
    const nextWidth = host.clientWidth || window.innerWidth;
    const nextHeight = host.clientHeight || window.innerHeight;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight);
    compositor.setSize(nextWidth, nextHeight);
    pointLayer.setPixelRatio(renderer.getPixelRatio());
    needsRender = true;
  }

  function updateHoverLabel(
    node: GraphNode<NMeta> | null,
    edge: GraphEdge<EMeta> | null,
    nodeId: string | null,
    edgeId: string | null,
  ) {
    if (node && nodeId) {
      const endpoint = resolveNodeEndpoint(nodeId);
      const position = endpoint
        ? endpoint.position
            .clone()
            .add(new THREE.Vector3(0, Math.max(HOVER_LABEL_MIN_HEIGHT, endpoint.radius * HOVER_LABEL_HEIGHT_FACTOR), 0))
        : null;
      setSceneLabel(hoverLabel, nodeDisplayLabel(node, accessors), position);
      return;
    }

    const edgeState = edge && edgeId ? (edgeStates.get(edgeId) ?? null) : null;
    setSceneLabel(
      hoverLabel,
      edgeState ? edgeDisplayLabel(edgeState.edge, accessors as ResolvedAccessors<unknown, EMeta>) : null,
      edgeState
        ? selectedEdgeLabelPosition(edgeState, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode)
        : null,
    );
  }

  function nodeHoverAnchor(endpoint: SceneEdgeEndpoint | null): GalaxyNodeHoverAnchor | null {
    if (!endpoint) return null;
    const viewportWidth = host.clientWidth || window.innerWidth;
    const viewportHeight = host.clientHeight || window.innerHeight;
    tmpVector.copy(endpoint.position).applyQuaternion(world.quaternion).project(camera);
    const visible = tmpVector.z < 1;
    return {
      nodeId: endpoint.id,
      viewportHeight,
      viewportWidth,
      visible,
      x: (tmpVector.x * 0.5 + 0.5) * viewportWidth,
      y: (-tmpVector.y * 0.5 + 0.5) * viewportHeight,
    };
  }

  function processHover() {
    hoverPending = false;
    const { node, edge, nodeId, edgeId } = picking.intersectAt(pendingHoverX, pendingHoverY);
    renderer.domElement.style.cursor = node || edge ? 'pointer' : 'grab';
    updateHoverLabel(node, edge, nodeId, edgeId);
    const nodeChanged = nodeId !== selection.hoveredNodeId;
    const edgeChanged = edgeId !== selection.hoveredEdgeId;
    if (nodeChanged || edgeChanged) {
      selection.hoveredNodeId = nodeId;
      selection.hoveredEdgeId = edgeId;
      updateHoverHighlight();
    }
    if (nodeChanged) {
      if (nodeId) emitGraphUxEvent({ type: 'node_hover', nodeId, timestampMs: performance.now() });
      if (focusModel.enabled && focusModel.variant !== 'baseline') {
        dispatchFocusEvent(nodeId ? { type: 'NODE_HOVER', nodeId } : { type: 'HOVER_END' });
      }
      callbacksRef.current.onHoverNode(node);
      callbacksRef.current.onHoverNodeAnchor?.(nodeId ? nodeHoverAnchor(resolveNodeEndpoint(nodeId)) : null);
    }
    if (edgeChanged) {
      callbacksRef.current.onHoverEdge(edge);
    }
  }

  function processSelect(clientX: number, clientY: number) {
    const { node, edge, cluster, clusterId } = picking.intersectAt(clientX, clientY);
    if (node) {
      focusedClusterId = null;
      emitGraphUxEvent({
        type: 'node_click',
        nodeId: node.id,
        timestampMs: performance.now(),
        cameraState,
      });
      callbacksRef.current.onSelectEdge(null);
      callbacksRef.current.onSelectCluster?.(null);
      if (focusModel.enabled && focusModel.variant !== 'baseline') {
        updateSelection(node.id, null);
        beginNodeFocus(node.id);
      }
      callbacksRef.current.onSelectNode(node);
      return;
    }
    if (edge) {
      focusedClusterId = null;
      callbacksRef.current.onSelectNode(null);
      callbacksRef.current.onSelectCluster?.(null);
      callbacksRef.current.onSelectEdge(edge);
      return;
    }
    if (cluster && clusterId) {
      focusedClusterId = clusterId;
      focusState = { name: 'idle' };
      activeCameraJob = null;
      selection.focusMode = 'none';
      selection.pathNodeIds = new Set();
      selection.pathEdgeIds = new Set();
      updateSelection(null, null);
      emitGraphUxEvent({
        type: 'cluster_click',
        clusterId,
        timestampMs: performance.now(),
        viewMode: selection.visibility?.mode ?? 'default',
      });
      callbacksRef.current.onSelectNode(null);
      callbacksRef.current.onSelectEdge(null);
      callbacksRef.current.onSelectCluster?.(cluster);
      startClusterCamera(clusterId);
      return;
    }
    focusedClusterId = null;
    callbacksRef.current.onSelectCluster?.(null);
    if (focusModel.enabled && focusModel.variant !== 'baseline')
      dispatchFocusEvent({ type: 'ESC_OR_BACKGROUND_CLICK' });
    else {
      callbacksRef.current.onSelectNode(null);
      callbacksRef.current.onSelectEdge(null);
    }
  }

  function handlePointerMove(event: PointerEvent) {
    pendingHoverX = event.clientX;
    pendingHoverY = event.clientY;
    hoverPending = true;
  }

  function handlePointerLeave() {
    hoverPending = false;
    clearHover();
    needsRender = true;
  }

  function handlePointerDown(event: PointerEvent) {
    host.focus();
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    pointerDownValid = true;
  }

  function handlePointerUp(event: PointerEvent) {
    if (!pointerDownValid) return;
    pointerDownValid = false;
    const dx = event.clientX - pointerDownX;
    const dy = event.clientY - pointerDownY;
    if (dx * dx + dy * dy <= CLICK_SLOP_SQ) processSelect(event.clientX, event.clientY);
  }

  function handleContextLost(event: Event) {
    event.preventDefault();
    onContextLost({
      reason: 'context-lost',
      message: 'The WebGL context was lost. Use retry to rebuild the scene.',
    });
  }

  function handleControlsStart() {
    if (programmaticCameraChangeDepth > 0) return;
    userControlActive = true;
    userControlPanOrOrbitEmitted = false;
    lastControlZoomDistance = currentZoomDistance();
  }

  function handleControlsEnd() {
    userControlActive = false;
    userControlPanOrOrbitEmitted = false;
    lastControlZoomDistance = currentZoomDistance();
  }

  function handleControlsChange() {
    cameraController.emitView();

    const zoomDistance = currentZoomDistance();
    if (programmaticCameraChangeDepth > 0 || !userControlActive) {
      lastControlZoomDistance = zoomDistance;
      return;
    }

    if (Math.abs(zoomDistance - lastControlZoomDistance) > ZOOM_DISTANCE_EPSILON) {
      emitZoomChanged(zoomDistance);
      lastControlZoomDistance = zoomDistance;
      return;
    }

    if (!userControlPanOrOrbitEmitted) {
      emitPanOrOrbit();
      userControlPanOrOrbitEmitted = true;
    }
  }

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  controls.addEventListener('start', handleControlsStart);
  controls.addEventListener('end', handleControlsEnd);
  controls.addEventListener('change', handleControlsChange);
  host.addEventListener('keydown', cameraController.handleKeyDown);
  host.addEventListener('keyup', cameraController.handleKeyUp);
  window.addEventListener('resize', resize);
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          resize();
        })
      : null;
  resizeObserver?.observe(host);
  cameraController.emitView();

  function animate() {
    animationFrame = window.requestAnimationFrame(animate);
    frame += 1;
    const keyboardMoved = cameraController.tickKeyboardMovement();
    if (keyboardMoved) {
      if (!keyboardCameraActive) emitPanOrOrbit();
      keyboardCameraActive = true;
      needsRender = true;
    } else {
      keyboardCameraActive = false;
    }
    if (tickCameraJob()) needsRender = true;
    controls.update();

    const paused = pausedRef.current;
    // In full-motion mode the world auto-rotates and markers spin, so the scene
    // genuinely changes every frame and must always render. Otherwise we render on
    // demand: the loop keeps ticking (to process damping) but skips the GPU submit
    // and label projection when nothing changed, instead of redrawing an identical
    // frame 60x a second.
    const animating = !paused && motion === 'full';
    if (animating && galaxyMode) world.rotation.y += WORLD_ROTATION_SPEED;

    if (animating) {
      markerLayer.spin();
    }

    if (hoverPending) {
      processHover();
      needsRender = true;
    }

    const pulseTimestamp = performance.now();
    if (hasActivePulse) {
      pulseTime += Math.min(0.05, (pulseTimestamp - lastPulseTimestamp) / 1000);
      pointLayer.setPulseTime(pulseTime);
      needsRender = true;
    }
    lastPulseTimestamp = pulseTimestamp;

    if (!animating && !needsRender) return;
    needsRender = false;

    // While animating, label projection stays throttled to every other frame; for a
    // one-off on-demand render we always reproject so labels are never a frame stale.
    if (animating ? frame % 2 === 0 : true) {
      const currentWidth = host.clientWidth || window.innerWidth;
      const currentHeight = host.clientHeight || window.innerHeight;
      labels.forEach((label) => {
        if (!label.active) {
          label.element.style.display = 'none';
          return;
        }
        tmpVector.copy(label.position).applyQuaternion(world.quaternion);
        setLabelPosition(label.element, tmpVector, camera, currentWidth, currentHeight);
      });
    }

    compositor.render(bloomActive);
  }

  animate();

  // Every public mutator changes what should be on screen, so wake the on-demand
  // loop after it runs. Camera methods already wake it through the controller,
  // but wrapping uniformly keeps the contract in one place.
  const wake =
    <Args extends unknown[], R>(fn: (...args: Args) => R) =>
    (...args: Args): R => {
      const result = fn(...args);
      needsRender = true;
      return result;
    };

  function focusNodeWithTelemetry(nodeId: string) {
    const node = nodeLookup.get(nodeId);
    if (!node || !nodePositions.has(node.id)) return;

    const startedAt = performance.now();
    cameraState = 'moving';
    emitGraphUxEvent({ type: 'focus_started', nodeId, timestampMs: startedAt, variant: uxVariant });
    runProgrammaticCameraChange(() => cameraController.focusNode(nodeId));
    cameraState = 'focused';

    const completedAt = performance.now();
    emitGraphUxEvent({
      type: 'focus_completed',
      nodeId,
      timestampMs: completedAt,
      durationMs: completedAt - startedAt,
      visibleNodeCount: pointLayer.visibleCount(),
      visibleEdgeCount: edgeLayer.visibleCount(),
    });
  }

  function focusEdgeWithTelemetry(edgeId: string) {
    runProgrammaticCameraChange(() => cameraController.focusEdge(edgeId));
  }

  function focusNodeCommand(nodeId: string, dataReady = true) {
    beginNodeFocus(nodeId, dataReady);
  }

  function moveCameraWithTelemetry(direction: SpaceDirection, multiplier?: number) {
    emitPanOrOrbit();
    runProgrammaticCameraChange(() => cameraController.move(direction, multiplier));
  }

  function resetCameraWithTelemetry() {
    if (focusModel.enabled && focusModel.variant !== 'baseline') {
      dispatchFocusEvent({ type: 'ESC_OR_BACKGROUND_CLICK' });
      return;
    }
    emitGraphUxEvent({
      type: 'camera_reset',
      timestampMs: performance.now(),
      ...focusedNodePayload(),
    });
    cameraState = 'idle';
    runProgrammaticCameraChange(cameraController.reset);
  }

  function expandNeighborsCommand(depth: 1 | 2 = 1) {
    dispatchFocusEvent(
      visibilityModelEnabled() && depth === 2 ? { type: 'EXPAND_DEEP' } : { type: 'EXPAND_NEIGHBORS', depth },
    );
  }

  function expandDeepCommand() {
    dispatchFocusEvent({ type: 'EXPAND_DEEP' });
  }

  function collapseNeighborsCommand() {
    dispatchFocusEvent({ type: 'COLLAPSE_NEIGHBORS' });
  }

  function collapseAllCommand() {
    dispatchFocusEvent({ type: 'COLLAPSE_ALL' });
  }

  function showPathCommand(pathType: PathFocusType, path: FocusPathResult) {
    dispatchFocusEvent({ type: 'SHOW_PATH', nodeId: path.nodeIds[0], pathType, path });
  }

  function hidePathCommand() {
    dispatchFocusEvent({ type: 'HIDE_PATH' });
  }

  function inspectPathCommand(nodeId?: string) {
    dispatchFocusEvent({ type: 'INSPECT_PATH', nodeId });
  }

  function recenterFocusCommand() {
    const nodeId = focusStateNodeId(focusState);
    if (!nodeId) return;
    if (focusState.name === 'orbitFocus') dispatchFocusEvent({ type: 'RECENTER' });
    else startFocusCamera(nodeId, 'recenter');
  }

  return {
    backFocus: wake(navigateBackFocus),
    collapseAll: wake(collapseAllCommand),
    collapseNeighbors: wake(collapseNeighborsCommand),
    completeFocusData: wake(completeFocusData),
    expandDeep: wake(expandDeepCommand),
    expandNeighbors: wake(expandNeighborsCommand),
    failFocusData: wake(failFocusData),
    focusEdge: wake(focusEdgeWithTelemetry),
    focusNode: wake(focusNodeCommand),
    hidePath: wake(hidePathCommand),
    inspectPath: wake(inspectPathCommand),
    moveCamera: wake(moveCameraWithTelemetry),
    recenterFocus: wake(recenterFocusCommand),
    resetCamera: wake(resetCameraWithTelemetry),
    showPath: wake(showPathCommand),
    timeoutFocusData: wake((nodeId: string) => dispatchFocusEvent({ type: 'DATA_TIMEOUT', nodeId })),
    unfocus: wake(() => dispatchFocusEvent({ type: 'ESC_OR_BACKGROUND_CLICK' })),
    updateAccessors: wake(updateAccessors),
    updateActiveGroup: wake(updateActiveGroup),
    updateClusterVisibility: wake(updateClusterVisibilityFromProp),
    updateGalaxyMode: wake(updateGalaxyMode),
    updateMotionPreference: wake(updateMotionPreference),
    updateNodeSizeScale: wake(updateNodeSizeScale),
    updatePlanetSizing: wake(updatePlanetSizing),
    updateSelection: wake(updateSelection),
    updateTheme: wake(updateTheme),
    updateFocusModel: wake(updateFocusModel),
    updateUxVariant: wake(updateUxVariant),
    updateVisibilityModel: wake(updateVisibilityModel),
    appendDataset: wake(appendDataset),
    dispose: () => {
      if (sceneDisposed) return;
      sceneDisposed = true;
      clearFocusDataTimeout();
      activeCameraJob = null;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      host.removeEventListener('keydown', cameraController.handleKeyDown);
      host.removeEventListener('keyup', cameraController.handleKeyUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('end', handleControlsEnd);
      controls.removeEventListener('change', handleControlsChange);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      clusterLayer.dispose();
      planetOverlay.dispose();
      compositor.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelsRoot.remove();
      hostThemePreviousVariables.forEach((previous, name) => {
        if (previous) host.style.setProperty(name, previous.value, previous.priority);
        else host.style.removeProperty(name);
      });
      hostThemePreviousVariables.clear();
    },
  };
}
