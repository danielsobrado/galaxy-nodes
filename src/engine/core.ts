import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { getEdgeId, resolveAccessors } from '../domain/data';
import {
  canUseDOM,
  detectWebGLAvailability,
  getGalaxyRendererContextBudget,
  reserveGalaxyRendererContext,
  resolveMotionPreference,
  type GalaxyMotionPreference,
  type GalaxyRendererContextBudget,
  type ResolvedGalaxyMotion,
} from './environment';
import { resolveGraphLayout, type GraphLayoutInput } from '../domain/layout';
import {
  buildSceneNodeIndex,
  buildNodeDegrees,
  maxDegreeForMode as getMaxDegreeForMode,
  edgeMatchesActiveGroup,
  getSceneRebuildKey,
  MAJOR_PLANET_LIMIT_ALL,
  MAJOR_PLANET_LIMIT_GROUP,
  planetSizeMultiplierForDegree,
  selectPlanetOverlayNodesBySizing,
  type PlanetSizingMode,
  type ResolvedPlanetSizing,
  type SceneNodeIndex,
} from './sceneData';
import type { GalaxySceneFailure, GalaxySceneFailureReason } from './sceneFallback';
import type {
  GraphAccessors,
  GalaxyCameraView,
  GraphCluster,
  GraphDataset,
  GraphEdge,
  GraphNode,
  ResolvedAccessors,
  SpaceDirection,
  Vec3,
} from '../domain/types';
import {
  MAX_STAR_COUNT,
  QUIET_STAR_COUNT,
  POINT_PICK_THRESHOLD,
  NODE_HIGHLIGHT_MARKER_LIMIT,
  NODE_HIGHLIGHT_FIRST_DEGREE_LIMIT,
  NODE_HIGHLIGHT_SECOND_DEGREE_LIMIT,
  SELECTED_NODE_RELATIONSHIP_LABEL_LIMIT,
  DIMMED_POINT_COLOR_FACTOR,
  KEY_MOVE_SPEED,
  KEY_MOVE_SPEED_VERTICAL,
  KEY_SHIFT_BOOST,
  CAMERA_MOVE_DISTANCE,
  MAX_PIXEL_RATIO,
  TONE_MAPPING_EXPOSURE,
  BLOOM_LAYER,
  BLOOM_STRENGTH,
  BLOOM_RADIUS,
  BLOOM_THRESHOLD,
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
  DEFAULT_PLANET_SIZE_MIN,
  DEFAULT_PLANET_SIZE_MAX,
  DEFAULT_PLANET_SIZE_STRENGTH,
  POINT_BASE_SIZE_GALAXY,
  POINT_BASE_SIZE_DEFAULT,
  POINT_SIZE_SELECTED,
  POINT_SIZE_FIRST_DEGREE,
  POINT_SIZE_SECOND_DEGREE,
  POINT_FIRST_DEGREE_TINT,
  POINT_SECOND_DEGREE_TINT,
  POINT_UNRELATED_DIM,
  SELECTION_POINT_OPACITY,
  FOCUS_STAR_DIM_FACTOR,
  FOCUS_CLUSTER_DIM_FACTOR,
  FOCUS_FOG_DENSITY_MULTIPLIER,
  FOCUS_DISTANCE_INNER,
  FOCUS_DISTANCE_OUTER,
  FOCUS_DISTANCE_DIM_FACTOR,
  POINT_CAPACITY_GROWTH_FACTOR,
  POINT_CAPACITY_GROWTH_PAD,
  STAR_DISTANCE_MIN,
  STAR_DISTANCE_SPAN,
  STAR_VERTICAL_SPREAD,
  STAR_SIZE,
  STAR_OPACITY,
  GLOW_SPRITE_OPACITY,
  CLUSTER_LABEL_HEIGHT_FACTOR,
  CLUSTER_SPRITE_SCALE_GALAXY,
  CLUSTER_SPRITE_SCALE_DEFAULT,
  PLANET_MATERIAL_OPACITY,
  RING_MATERIAL_OPACITY,
  NODE_IMAGE_SPRITE_OPACITY,
  NODE_IMAGE_MAX_ANISOTROPY,
  PLANET_RADIUS_FACTOR,
  NODE_IMAGE_SCALE_FACTOR,
  NODE_IMAGE_MIN_SCALE,
  DIM_COLOR_MULTIPLIER,
  PLANET_SCALE_SELECTED,
  PLANET_SCALE_RELATED,
  PLANET_SCALE_SECOND_DEGREE,
  PLANET_SCALE_HOVERED,
  RING_SCALE_BASE,
  RING_SCALE_SELECTED,
  RING_SCALE_RELATED,
  RING_SCALE_SECOND_DEGREE,
  RING_SCALE_HOVERED,
  RING_SCALE_IDLE,
  PLANET_HOVER_BRIGHTEN,
  PLANET_YAW_CYCLE,
  PLANET_YAW_STEP,
  RING_TILT_X,
  RING_TILT_Y,
  MAJOR_LABEL_NODE_SIZE_FACTOR,
  MAJOR_LABEL_RADIUS_FACTOR,
  HOVER_BALL_SPIN,
  HIGHLIGHT_MARKER_SCALE_NEAR,
  HIGHLIGHT_MARKER_SCALE_FAR,
  HIGHLIGHT_MARKER_STRENGTH_NEAR,
  HIGHLIGHT_MARKER_STRENGTH_FAR,
  ENDPOINT_MARKER_SCALE_PRIMARY,
  ENDPOINT_MARKER_SCALE_SECONDARY,
  NODE_MARKER_LABEL_OFFSET_X,
  NODE_MARKER_LABEL_OFFSET_Y,
  NODE_MARKER_LABEL_MIN_X,
  NODE_MARKER_LABEL_MIN_Y,
  ENDPOINT_INNER_RING_SPIN,
  ENDPOINT_OUTER_RING_SPIN,
  ENDPOINT_RING_SPIN_STAGGER,
  HIGHLIGHT_INNER_RING_SPIN,
  HIGHLIGHT_OUTER_RING_SPIN,
  HIGHLIGHT_RING_SPIN_STAGGER,
  ENDPOINT_MIN_RADIUS,
  ENDPOINT_PLANET_RADIUS_FACTOR,
  ENDPOINT_NODE_SIZE_FACTOR_MAJOR,
  ENDPOINT_NODE_SIZE_FACTOR_MINOR,
  CLUSTER_ENDPOINT_MIN_RADIUS,
  CLUSTER_ENDPOINT_RADIUS_FACTOR,
  EDGE_MIDPOINT_LERP,
  EDGE_OPACITY_SELECTED_CAP,
  EDGE_OPACITY_SELECTED_BOOST,
  EDGE_OPACITY_HOVER_CAP,
  EDGE_OPACITY_HOVER_BOOST,
  EDGE_OPACITY_CONNECTED_CAP,
  EDGE_OPACITY_CONNECTED_BOOST,
  EDGE_OPACITY_UNRELATED_DIM,
  HOVER_EDGE_OVERLAY_OPACITY,
  HOVER_EDGE_RADIUS_FACTOR,
  FOCUS_NODE_OFFSET_X_SCALE,
  FOCUS_NODE_OFFSET_X_BASE,
  FOCUS_NODE_OFFSET_Y_SCALE,
  FOCUS_NODE_OFFSET_Y_BASE,
  FOCUS_NODE_OFFSET_Z_SCALE,
  FOCUS_NODE_OFFSET_Z_BASE,
  FOCUS_EDGE_MIN_DISTANCE,
  FOCUS_EDGE_OFFSET_XY_SCALE,
  FOCUS_EDGE_OFFSET_X_BASE,
  FOCUS_EDGE_OFFSET_Y_BASE,
  FOCUS_EDGE_OFFSET_Z_SCALE,
  FOCUS_EDGE_OFFSET_Z_BASE,
  HOVER_LABEL_MIN_HEIGHT,
  HOVER_LABEL_HEIGHT_FACTOR,
  WORLD_ROTATION_SPEED,
  EDGE_LINE_SEGMENTS,
  SCALE_RENDER_ELEMENT_THRESHOLD,
  DENSITY_REFERENCE_COUNT,
  DENSITY_MIN_SCALE,
  RENDER_MSAA_SAMPLES,
} from './sceneConstants';
import { dimColor, makeGlowTexture, makePlanetTexture, planetColor, pointCloudColor } from './materials';
import { createEdgeLineGeometry, createTubeGeometry, getEdgeSpec, selectedEdgeLabelPosition } from './edges';
import { createEndpointMarker, createHoverNodeMarker, setHoverNodeMarkerVisible, setMarkerVisible } from './markers';
import {
  edgeDisplayLabel,
  makeSceneLabel,
  nodeDisplayLabel,
  selectedEdgeDisplayLabel,
  setLabelPosition,
  setSceneLabel,
  shouldShowClusterLabel,
  shouldShowMajorLabel,
} from './labels';
import type {
  EdgeEndpoints,
  EdgeVisualRange,
  EdgeVisualState,
  EndpointMarker,
  SceneEdgeEndpoint,
  SceneLabel,
} from './sceneTypes';

export { getGalaxyRendererContextBudget } from './environment';
export type { GalaxyMotionPreference, GalaxyRendererContextBudget } from './environment';
export type { GalaxySceneFailure, GalaxySceneFailureReason } from './sceneFallback';

export interface CameraCommand {
  type: 'focus' | 'focus-edge' | 'move' | 'reset';
  direction?: SpaceDirection;
  edgeId?: string;
  nodeId?: string;
  nonce: number;
}

export interface GalaxyRendererOptions<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  dataset: GraphDataset<NMeta, EMeta, CMeta>;
  /** Active group filter, or `null` to show everything. */
  activeGroup: string | null;
  showClusters: boolean;
  galaxyMode: boolean;
  layout?: GraphLayoutInput;
  /** Visual accessors. They are now applied in place rather than rebuilding the scene. */
  accessors?: GraphAccessors<NMeta, EMeta>;
  theme?: GalaxyGraphTheme;
  cameraCommand: CameraCommand | null;
  /** Maximum active Galaxy renderer WebGL contexts allowed in this browser tab. Defaults to 12. */
  contextLimit?: number;
  motionPreference?: GalaxyMotionPreference;
  paused?: boolean;
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
   * to lightweight line edges past ~{@link SCALE_RENDER_ELEMENT_THRESHOLD} elements;
   * `'quality'` forces tubes, `'scale'` forces lines. Construction-time only.
   */
  renderMode?: GalaxyRenderMode;
}

export type GalaxyRenderMode = 'auto' | 'quality' | 'scale';
export type EdgeRenderMode = 'tube' | 'line';

/**
 * Pick the edge render tier. Honors an explicit `renderMode`, otherwise compares the
 * larger of the declared `expectedSize` and the current element count against the
 * measured scale threshold (see scripts/browser-perf.mjs).
 */
export function resolveEdgeRenderMode(
  nodeCount: number,
  edgeCount: number,
  expectedSize: number | undefined,
  renderMode: GalaxyRenderMode | undefined,
): EdgeRenderMode {
  if (renderMode === 'quality') return 'tube';
  if (renderMode === 'scale') return 'line';
  const elements = Math.max(expectedSize ?? 0, nodeCount + edgeCount);
  return elements >= SCALE_RENDER_ELEMENT_THRESHOLD ? 'line' : 'tube';
}

/**
 * Adaptive per-element opacity multiplier that keeps additive node/edge blending from
 * saturating to white as the graph grows. Returns 1 at or below
 * {@link DENSITY_REFERENCE_COUNT} (the dense-but-readable look is left untouched), then
 * tapers as sqrt(reference / count), floored at {@link DENSITY_MIN_SCALE}.
 */
export function resolveDensityScale(count: number): number {
  if (count <= DENSITY_REFERENCE_COUNT) return 1;
  return Math.max(DENSITY_MIN_SCALE, Math.min(1, Math.sqrt(DENSITY_REFERENCE_COUNT / count)));
}

export interface GalaxyPlanetSizingOptions {
  /** `degree` uses all links, `incoming` uses target links, `outgoing` uses source links, `accessor` uses nodeSize only. */
  mode?: PlanetSizingMode;
  /** Multiplier applied to the final planet radius. */
  scale?: number;
  /** Lower visual multiplier for degree-based sizing. */
  min?: number;
  /** Upper visual multiplier for degree-based sizing. */
  max?: number;
  /** Higher values make hubs separate more strongly from low-degree nodes. */
  strength?: number;
}

export interface GalaxyRendererCallbacks<NMeta = unknown, EMeta = unknown> {
  onCameraViewChange?: (view: GalaxyCameraView) => void;
  onContextBudgetExceeded?: (budget: GalaxyRendererContextBudget) => void;
  onSceneFailure?: (failure: GalaxySceneFailure) => void;
  onSceneReady?: () => void;
  onSelectNode?: (node: GraphNode<NMeta> | null) => void;
  onHoverNode?: (node: GraphNode<NMeta> | null) => void;
  onSelectEdge?: (edge: GraphEdge<EMeta> | null) => void;
  onHoverEdge?: (edge: GraphEdge<EMeta> | null) => void;
}

interface MutableRef<T> {
  current: T;
}

type SceneCallbacks<NMeta = unknown, EMeta = unknown> = Required<
  Pick<GalaxyRendererCallbacks<NMeta, EMeta>, 'onHoverEdge' | 'onHoverNode' | 'onSelectEdge' | 'onSelectNode'>
> &
  Pick<GalaxyRendererCallbacks<NMeta, EMeta>, 'onCameraViewChange'>;

export interface GalaxyRenderer<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  focusEdge: (edgeId: string) => void;
  focusNode: (nodeId: string) => void;
  moveCamera: (direction: SpaceDirection, multiplier?: number) => void;
  resetCamera: () => void;
  retry: () => void;
  update: (
    options: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
    callbacks?: GalaxyRendererCallbacks<NMeta, EMeta>,
  ) => void;
  dispose: () => void;
}

interface SceneRuntime<NMeta = unknown, EMeta = unknown> {
  focusEdge: (edgeId: string) => void;
  focusNode: (nodeId: string) => void;
  moveCamera: (direction: SpaceDirection, multiplier?: number) => void;
  resetCamera: () => void;
  updateAccessors: (accessors: GraphAccessors<NMeta, EMeta> | undefined) => void;
  updateActiveGroup: (activeGroup: string | null) => void;
  updateClusterVisibility: (showClusters: boolean) => void;
  updateGalaxyMode: (galaxyMode: boolean) => void;
  updateMotionPreference: (motion: ResolvedGalaxyMotion) => void;
  updatePlanetSizing: (planetSizing: GalaxyPlanetSizingOptions | undefined) => void;
  updateSelection: (selectedNodeId: string | null, selectedEdgeId: string | null) => void;
  updateTheme: (theme: GalaxyGraphTheme | undefined) => void;
  appendDataset: (dataset: GraphDataset<NMeta, EMeta>) => void;
  dispose: () => void;
}

class AcesOutputPass extends OutputPass {
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    const previousToneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      renderer.toneMapping = previousToneMapping;
    }
  }
}

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

/** Snapshot of the inputs each in-place updater consumes, used to diff `update()` calls. */
interface AppliedRendererState<NMeta = unknown, EMeta = unknown> {
  accessors: GraphAccessors<NMeta, EMeta> | undefined;
  activeGroup: string | null;
  galaxyMode: boolean;
  planetSizing: GalaxyPlanetSizingOptions | undefined;
  resolvedMotion: ResolvedGalaxyMotion;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  showClusters: boolean;
  theme: GalaxyGraphTheme | undefined;
}

interface CoreState<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
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

function noop() {
  return undefined;
}

function vectorToVec3(vector: THREE.Vector3): Vec3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function resolveRendererCallbacks<NMeta, EMeta>(
  callbacks?: GalaxyRendererCallbacks<NMeta, EMeta>,
): SceneCallbacks<NMeta, EMeta> {
  return {
    onCameraViewChange: callbacks?.onCameraViewChange,
    onHoverEdge: callbacks?.onHoverEdge ?? noop,
    onHoverNode: callbacks?.onHoverNode ?? noop,
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

interface NodeSelectionHighlight {
  connectedEdgeIds: Set<string>;
  firstDegreeNodeIds: Set<string>;
  secondDegreeNodeIds: Set<string>;
}

interface NodeHighlightMarker {
  label: SceneLabel;
  marker: EndpointMarker;
}

interface ClusterVisual {
  group?: string;
  label: SceneLabel;
  labelText: string;
  labelIndex: number;
  radius: number;
  sprite: THREE.Sprite;
}

export interface GalaxyGraphTheme {
  background?: string;
  panelAccentColor?: string;
  selectedColor?: string;
}

const CAMERA_HOME = new THREE.Vector3(120, 430, 1540);
const TARGET_HOME = new THREE.Vector3(0, 0, 0);
const tmpVector = new THREE.Vector3();
const tmpDirection = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMove = new THREE.Vector3();
const tmpPointSelectionColor = new THREE.Color();
const tmpPointSelectionTargetColor = new THREE.Color();
const tmpEdgeAppearanceColor = new THREE.Color();
const instanceDummy = new THREE.Object3D();
const EDGE_STATE_SELECTED = 1;
const EDGE_STATE_HOVERED = 2;
const EDGE_STATE_CONNECTED = 4;
const EDGE_STATE_DIMMED = 8;
const EDGE_STATE_VISIBLE = 16;

const DEFAULT_PLANET_SIZING: ResolvedPlanetSizing = {
  mode: 'accessor',
  scale: 1,
  min: DEFAULT_PLANET_SIZE_MIN,
  max: DEFAULT_PLANET_SIZE_MAX,
  strength: DEFAULT_PLANET_SIZE_STRENGTH,
};

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

function resolvePlanetSizing(planetSizing?: GalaxyPlanetSizingOptions): ResolvedPlanetSizing {
  return {
    ...DEFAULT_PLANET_SIZING,
    ...planetSizing,
  };
}

function resolveEndpoint<NMeta, EMeta>(
  id: string,
  nodeLookup: Map<string, GraphNode<NMeta>>,
  nodePositions: Map<string, Vec3>,
  clusterLookup: Map<string, SceneEdgeEndpoint>,
  accessors: ResolvedAccessors<NMeta, EMeta>,
  planetRadius: (node: GraphNode<NMeta>) => number,
): SceneEdgeEndpoint | null {
  const node = nodeLookup.get(id);
  const position = node ? nodePositions.get(node.id) : undefined;
  if (node && position) {
    const radius = Math.max(
      ENDPOINT_MIN_RADIUS,
      planetRadius(node) * ENDPOINT_PLANET_RADIUS_FACTOR,
      accessors.nodeSize(node) * (node.major ? ENDPOINT_NODE_SIZE_FACTOR_MAJOR : ENDPOINT_NODE_SIZE_FACTOR_MINOR),
    );
    return {
      group: node.group,
      id: node.id,
      isNode: true,
      label: nodeDisplayLabel(node, accessors),
      position: new THREE.Vector3(position.x, position.y, position.z),
      radius,
    };
  }

  return clusterLookup.get(id) ?? null;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  );
}

function clearSceneDom(host: HTMLDivElement) {
  Array.from(host.children).forEach((child) => {
    if (child.tagName === 'CANVAS' || child.classList.contains('scene-labels')) child.remove();
  });
}

function createScene<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLDivElement,
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  initialActiveGroup: string | null,
  initialShowClusters: boolean,
  initialGalaxyMode: boolean,
  initialMotion: ResolvedGalaxyMotion,
  edgeRenderMode: EdgeRenderMode,
  layoutInput: GraphLayoutInput | undefined,
  accessorsInput: GraphAccessors<NMeta, EMeta> | undefined,
  planetSizingInput: GalaxyPlanetSizingOptions | undefined,
  initialTheme: GalaxyGraphTheme | undefined,
  callbacksRef: MutableRef<SceneCallbacks<NMeta, EMeta>>,
  pausedRef: MutableRef<boolean>,
  onContextLost: (failure: GalaxySceneFailure) => void,
): SceneRuntime<NMeta, EMeta> {
  let activeGroup = initialActiveGroup;
  let showClusters = initialShowClusters;
  let galaxyMode = initialGalaxyMode;
  let motion = initialMotion;
  let selectedNodeId: string | null = null;
  let selectedEdgeId: string | null = null;
  let selectedNodeHighlight: NodeSelectionHighlight | null = null;
  let hoveredNodeId: string | null = null;
  let hoveredEdgeId: string | null = null;
  let theme = initialTheme;
  let accessors = resolveAccessors(accessorsInput);
  let planetSizing = resolvePlanetSizing(planetSizingInput);
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

  const labelsRoot = document.createElement('div');
  labelsRoot.className = 'scene-labels';
  host.appendChild(labelsRoot);

  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height);
  renderer.setClearColor(theme?.background ?? '#07090d', 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090b11, galaxyMode ? FOG_DENSITY_GALAXY : FOG_DENSITY_DEFAULT);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.copy(CAMERA_HOME);

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  const bloomRenderPass = new RenderPass(scene, camera, null, new THREE.Color(0x000000), 1);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  bloomComposer.addPass(bloomRenderPass);
  bloomComposer.addPass(bloomPass);

  // The base scene renders into this offscreen target before bloom is composited and
  // tone-mapped. EffectComposer ignores the canvas `antialias` flag, so give the target
  // an explicit MSAA sample count or thin edges/geometry alias and shimmer on movement.
  const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const finalRenderTarget = new THREE.WebGLRenderTarget(drawingBufferSize.width, drawingBufferSize.height, {
    samples: RENDER_MSAA_SAMPLES,
    // Half-float so the many overlapping additive edges/points accumulate in HDR instead
    // of an 8-bit buffer. 8-bit quantises each low-opacity layer to ~20 levels, and those
    // bands crawl frame-to-frame as the camera moves (the grainy shimmer on the tubes);
    // float accumulation is smooth and lets tone mapping roll off highlights past 1.0.
    type: THREE.HalfFloatType,
  });
  const finalComposer = new EffectComposer(renderer, finalRenderTarget);
  const finalRenderPass = new RenderPass(scene, camera);
  const finalBloomPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
        }
      `,
    }),
    'baseTexture',
  );
  const emptyBloomTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  emptyBloomTexture.needsUpdate = true;
  const outputPass = new AcesOutputPass();
  finalComposer.addPass(finalRenderPass);
  finalComposer.addPass(finalBloomPass);
  finalComposer.addPass(outputPass);

  let refreshBloomActive: (() => void) | null = null;

  function setBloomLayer(object: THREE.Object3D, enabled: boolean) {
    object.traverse((entry) => {
      if (enabled) entry.layers.enable(BLOOM_LAYER);
      else entry.layers.disable(BLOOM_LAYER);
    });
    refreshBloomActive?.();
  }

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

  const cameraViewDirection = new THREE.Vector3();
  const cameraViewRight = new THREE.Vector3();
  const cameraViewUp = new THREE.Vector3();
  const selectionFocusPosition = new THREE.Vector3();

  function currentCameraView(): GalaxyCameraView {
    const direction = camera.getWorldDirection(cameraViewDirection).normalize();
    const right = cameraViewRight.crossVectors(direction, camera.up).normalize();
    const up = cameraViewUp.copy(camera.up).normalize();
    return {
      direction: vectorToVec3(direction),
      position: vectorToVec3(camera.position),
      right: vectorToVec3(right),
      target: vectorToVec3(controls.target),
      up: vectorToVec3(up),
    };
  }

  function emitCameraView() {
    // Every camera change funnels through here (the OrbitControls 'change' event,
    // damping inertia frames, WASD pans, and focus/reset), so it is the single
    // choke point that wakes the render loop on movement.
    needsRender = true;
    callbacksRef.current.onCameraViewChange?.(currentCameraView());
  }

  controls.addEventListener('change', emitCameraView);

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
  const incidentEdgeIdsByNodeId = new Map<string, Set<string>>();
  const neighborNodeIdsByNodeId = new Map<string, Set<string>>();
  const interactiveEdgeMeshes: THREE.Object3D[] = [];
  const edgeVisualRanges = new Map<string, EdgeVisualRange>();

  // Point-cloud attribute buffers grow on incremental append (see growPointBuffers).
  // They are over-allocated with spare capacity so streamed chunks rarely reallocate,
  // and the geometry draw range caps rendering/picking to the live node count.
  let pointCapacity = dataset.nodes.length;
  let pointPositions = new Float32Array(pointCapacity * 3);
  let basePointColors = new Float32Array(pointCapacity * 3);
  let pointColors = new Float32Array(pointCapacity * 3);
  let basePointSizes = new Float32Array(pointCapacity);
  let visiblePointSizes = new Float32Array(pointCapacity);

  dataset.nodes.forEach((node, index) => {
    const position = nodePositions.get(node.id)!;
    pointPositions[index * 3] = position.x;
    pointPositions[index * 3 + 1] = position.y;
    pointPositions[index * 3 + 2] = position.z;
  });

  const pointsGeometry = new THREE.BufferGeometry();
  let pointColorAttribute = new THREE.BufferAttribute(pointColors, 3);
  let pointSizeAttribute = new THREE.BufferAttribute(visiblePointSizes, 1);
  pointColorAttribute.setUsage(THREE.DynamicDrawUsage);
  pointSizeAttribute.setUsage(THREE.DynamicDrawUsage);
  pointsGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
  pointsGeometry.setAttribute('color', pointColorAttribute);
  pointsGeometry.setAttribute('size', pointSizeAttribute);

  const pointsMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      pixelRatio: { value: renderer.getPixelRatio() },
      baseSize: { value: galaxyMode ? POINT_BASE_SIZE_GALAXY : POINT_BASE_SIZE_DEFAULT },
      globalOpacity: { value: 1 },
      densityScale: { value: resolveDensityScale(dataset.nodes.length) },
      focusActive: { value: 0 },
      focusPosition: { value: new THREE.Vector3() },
      focusInner: { value: FOCUS_DISTANCE_INNER },
      focusOuter: { value: FOCUS_DISTANCE_OUTER },
      focusDim: { value: FOCUS_DISTANCE_DIM_FACTOR },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      varying float vSharpness;
      varying float vFocus;
      uniform float pixelRatio;
      uniform float baseSize;
      uniform float focusActive;
      uniform vec3 focusPosition;
      uniform float focusInner;
      uniform float focusOuter;
      void main() {
        vColor = color;
        float focusDistance = distance(position, focusPosition);
        vFocus = mix(1.0, 1.0 - smoothstep(focusInner, focusOuter, focusDistance), focusActive);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float attenuation = clamp(300.0 / -mvPosition.z, 0.36, 3.65);
        vSharpness = smoothstep(0.9, 2.8, attenuation);
        gl_PointSize = size * baseSize * attenuation * pixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vSharpness;
      varying float vFocus;
      uniform float globalOpacity;
      uniform float densityScale;
      uniform float focusActive;
      uniform float focusDim;
      void main() {
        vec2 uv = gl_PointCoord.xy - vec2(0.5);
        float dist = length(uv);
        float edge = mix(0.08, 0.18, vSharpness);
        float coreWidth = mix(0.16, 0.24, vSharpness);
        float alpha = smoothstep(0.5, edge, dist);
        float core = smoothstep(coreWidth, 0.0, dist);
        float opacity = mix(0.32, 0.52, vSharpness);
        float focusOpacity = mix(focusDim, 1.0, vFocus);
        gl_FragColor = vec4(vColor * (1.0 + core * 0.72), alpha * opacity * globalOpacity * densityScale * mix(1.0, focusOpacity, focusActive));
        #include <colorspace_fragment>
      }
    `,
  });
  const pointCloud = new THREE.Points(pointsGeometry, pointsMaterial);
  pointCloud.userData.type = 'node-points';
  world.add(pointCloud);

  let edgeVisualCapacity = 1;
  let edgeVisualVertexCount = 0;
  let edgePositions = new Float32Array(edgeVisualCapacity * 3);
  let edgeNormals = new Float32Array(edgeVisualCapacity * 3);
  let edgeColors = new Float32Array(edgeVisualCapacity * 3);
  let edgeBaseOpacities = new Float32Array(edgeVisualCapacity);
  let edgeStatesAttribute = new Float32Array(edgeVisualCapacity);
  let edgeFlows = new Float32Array(edgeVisualCapacity);

  const edgeVisualGeometry = new THREE.BufferGeometry();
  let edgePositionAttribute = new THREE.BufferAttribute(edgePositions, 3);
  let edgeNormalAttribute = new THREE.BufferAttribute(edgeNormals, 3);
  let edgeColorAttribute = new THREE.BufferAttribute(edgeColors, 3);
  let edgeBaseOpacityAttribute = new THREE.BufferAttribute(edgeBaseOpacities, 1);
  let edgeStateAttribute = new THREE.BufferAttribute(edgeStatesAttribute, 1);
  let edgeFlowAttribute = new THREE.BufferAttribute(edgeFlows, 1);
  edgeColorAttribute.setUsage(THREE.DynamicDrawUsage);
  edgeStateAttribute.setUsage(THREE.DynamicDrawUsage);
  edgeVisualGeometry.setAttribute('position', edgePositionAttribute);
  edgeVisualGeometry.setAttribute('normal', edgeNormalAttribute);
  edgeVisualGeometry.setAttribute('aColor', edgeColorAttribute);
  edgeVisualGeometry.setAttribute('aBaseOpacity', edgeBaseOpacityAttribute);
  edgeVisualGeometry.setAttribute('aState', edgeStateAttribute);
  edgeVisualGeometry.setAttribute('aFlow', edgeFlowAttribute);
  edgeVisualGeometry.setDrawRange(0, 0);

  const edgeVisualMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      pulseStrength: { value: 0.08 },
      selectedOpacityCap: { value: EDGE_OPACITY_SELECTED_CAP },
      selectedOpacityBoost: { value: EDGE_OPACITY_SELECTED_BOOST },
      hoverOpacityCap: { value: EDGE_OPACITY_HOVER_CAP },
      hoverOpacityBoost: { value: EDGE_OPACITY_HOVER_BOOST },
      connectedOpacityCap: { value: EDGE_OPACITY_CONNECTED_CAP },
      connectedOpacityBoost: { value: EDGE_OPACITY_CONNECTED_BOOST },
      unrelatedDim: { value: EDGE_OPACITY_UNRELATED_DIM },
      densityScale: { value: resolveDensityScale(dataset.edges.length) },
      focusActive: { value: 0 },
      focusPosition: { value: new THREE.Vector3() },
      focusInner: { value: FOCUS_DISTANCE_INNER },
      focusOuter: { value: FOCUS_DISTANCE_OUTER },
      focusDim: { value: FOCUS_DISTANCE_DIM_FACTOR },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aBaseOpacity;
      attribute float aState;
      attribute float aFlow;
      varying vec3 vColor;
      varying float vBaseOpacity;
      varying float vState;
      varying float vFlow;
      varying float vViewZ;
      varying float vFocus;
      uniform float focusActive;
      uniform vec3 focusPosition;
      uniform float focusInner;
      uniform float focusOuter;
      void main() {
        vColor = aColor;
        vBaseOpacity = aBaseOpacity;
        vState = aState;
        vFlow = aFlow;
        float focusDistance = distance(position, focusPosition);
        vFocus = mix(1.0, 1.0 - smoothstep(focusInner, focusOuter, focusDistance), focusActive);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewZ = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vBaseOpacity;
      varying float vState;
      varying float vFlow;
      varying float vViewZ;
      varying float vFocus;
      uniform float uTime;
      uniform float pulseStrength;
      uniform float selectedOpacityCap;
      uniform float selectedOpacityBoost;
      uniform float hoverOpacityCap;
      uniform float hoverOpacityBoost;
      uniform float connectedOpacityCap;
      uniform float connectedOpacityBoost;
      uniform float unrelatedDim;
      uniform float densityScale;
      uniform float focusActive;
      uniform float focusDim;
      float stateBit(float stateValue, float bitValue) {
        return mod(floor(stateValue / bitValue), 2.0);
      }
      void main() {
        float selected = stateBit(vState, 1.0);
        float hovered = stateBit(vState, 2.0);
        float connected = stateBit(vState, 4.0);
        float dimmed = stateBit(vState, 8.0);
        float visible = stateBit(vState, 16.0);
        if (visible < 0.5) discard;

        float opacity = vBaseOpacity;
        if (selected > 0.5) {
          opacity = min(selectedOpacityCap, vBaseOpacity + selectedOpacityBoost);
        } else if (hovered > 0.5) {
          opacity = min(hoverOpacityCap, vBaseOpacity + hoverOpacityBoost);
        } else if (connected > 0.5) {
          opacity = min(connectedOpacityCap, vBaseOpacity + connectedOpacityBoost);
        } else if (dimmed > 0.5) {
          opacity = vBaseOpacity * unrelatedDim;
        }

        float depthFade = smoothstep(0.0, 80.0, vViewZ);
        float focusOpacity = mix(focusDim, 1.0, vFocus);
        float pulse = (0.5 + 0.5 * sin(vFlow * 18.849555 + uTime * 5.0)) * pulseStrength;
        // Tame the additive haze from bulk edges as density rises, but keep highlighted
        // edges (selected/hovered/connected) at full strength so they still read.
        float highlighted = max(selected, max(hovered, connected));
        float density = mix(densityScale, 1.0, highlighted);
        opacity = opacity * depthFade * density * mix(1.0, focusOpacity, focusActive) + pulse * selected;
        if (opacity <= 0.0) discard;
        gl_FragColor = vec4(vColor, opacity);
        #include <colorspace_fragment>
      }
    `,
  });
  const edgeVisualMesh =
    edgeRenderMode === 'line'
      ? new THREE.LineSegments(edgeVisualGeometry, edgeVisualMaterial)
      : new THREE.Mesh(edgeVisualGeometry, edgeVisualMaterial);
  edgeVisualMesh.userData.type = 'edge-visuals';
  edgeVisualMesh.frustumCulled = false;
  world.add(edgeVisualMesh);

  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(MAX_STAR_COUNT * 3);
  for (let index = 0; index < MAX_STAR_COUNT; index += 1) {
    const distance = STAR_DISTANCE_MIN + Math.random() * STAR_DISTANCE_SPAN;
    const angle = Math.random() * Math.PI * 2;
    starPositions[index * 3] = Math.cos(angle) * distance;
    starPositions[index * 3 + 1] = (Math.random() - 0.5) * STAR_VERTICAL_SPREAD;
    starPositions[index * 3 + 2] = Math.sin(angle) * distance;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setDrawRange(0, galaxyMode ? MAX_STAR_COUNT : QUIET_STAR_COUNT);
  const starMaterial = new THREE.PointsMaterial({
    color: 0xb8c9d9,
    size: STAR_SIZE,
    transparent: true,
    opacity: STAR_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  world.add(new THREE.Points(starGeometry, starMaterial));

  const glowTexture = makeGlowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: GLOW_SPRITE_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
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
  const clusterVisuals: ClusterVisual[] = graphLayout.clusters.map((cluster, index) => {
    const sprite = new THREE.Sprite(glowMaterial.clone());
    sprite.position.set(cluster.center.x, cluster.center.y, cluster.center.z);
    world.add(sprite);

    const label = makeSceneLabel(labelsRoot, 'cluster-label');
    labels.push(label);
    label.position.set(
      cluster.center.x,
      cluster.center.y + cluster.radius * CLUSTER_LABEL_HEIGHT_FACTOR,
      cluster.center.z,
    );

    return {
      group: cluster.group,
      label,
      labelText: cluster.label,
      labelIndex: index,
      radius: cluster.radius,
      sprite,
    };
  });

  function focusFogDensity(hasSelection: boolean) {
    const baseDensity = galaxyMode ? FOG_DENSITY_GALAXY : FOG_DENSITY_DEFAULT;
    return hasSelection ? baseDensity * FOCUS_FOG_DENSITY_MULTIPLIER : baseDensity;
  }

  function applyFocusState(hasSelection: boolean, focusPosition: THREE.Vector3 | null) {
    const focusActive = hasSelection && Boolean(focusPosition);
    starMaterial.opacity = STAR_OPACITY * (hasSelection ? FOCUS_STAR_DIM_FACTOR : 1);
    clusterVisuals.forEach(({ sprite }) => {
      (sprite.material as THREE.SpriteMaterial).opacity =
        GLOW_SPRITE_OPACITY * (hasSelection ? FOCUS_CLUSTER_DIM_FACTOR : 1);
    });
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = focusFogDensity(hasSelection);

    pointsMaterial.uniforms.focusActive.value = focusActive ? 1 : 0;
    edgeVisualMaterial.uniforms.focusActive.value = focusActive ? 1 : 0;
    if (focusPosition) pointsMaterial.uniforms.focusPosition.value.copy(focusPosition);
    if (focusPosition) edgeVisualMaterial.uniforms.focusPosition.value.copy(focusPosition);
    hasActivePulse = hasSelection;
    if (!hasSelection) {
      pulseTime = 0;
      pointsMaterial.uniforms.uTime.value = 0;
      edgeVisualMaterial.uniforms.uTime.value = 0;
    }
  }

  const planetTexture = makePlanetTexture();
  const planetGeometry = new THREE.SphereGeometry(1, 36, 24);
  const planetMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: planetTexture,
    transparent: true,
    opacity: PLANET_MATERIAL_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    vertexColors: true,
  });
  const planetMesh = new THREE.InstancedMesh(planetGeometry, planetMaterial, MAJOR_PLANET_LIMIT_ALL);
  planetMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  planetMesh.renderOrder = 12;
  planetMesh.userData.type = 'node-instances';
  planetMesh.count = 0;
  world.add(planetMesh);

  const ringGeometry = new THREE.RingGeometry(1.28, 1.34, 96);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: RING_MATERIAL_OPACITY,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    vertexColors: true,
  });
  const ringMesh = new THREE.InstancedMesh(ringGeometry, ringMaterial, MAJOR_PLANET_LIMIT_ALL);
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringMesh.renderOrder = 13;
  ringMesh.count = 0;
  world.add(ringMesh);

  const nodeImageLoader = new THREE.TextureLoader();
  nodeImageLoader.setCrossOrigin('anonymous');
  const nodeImageTextures = new Map<string, THREE.Texture>();
  const nodeImageSprites = Array.from({ length: MAJOR_PLANET_LIMIT_ALL }, () => {
    const material = new THREE.SpriteMaterial({
      transparent: true,
      opacity: NODE_IMAGE_SPRITE_OPACITY,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 14;
    sprite.visible = false;
    world.add(sprite);
    return sprite;
  });

  const planetInstanceNodeIds: string[] = [];
  const nodeLabelPool = Array.from({ length: MAJOR_PLANET_LIMIT_ALL }, () => {
    const label = makeSceneLabel(labelsRoot, 'node-label');
    labels.push(label);
    return label;
  });

  const endpointMarkers: [EndpointMarker, EndpointMarker] = [
    createEndpointMarker(theme?.selectedColor ?? '#ffffff'),
    createEndpointMarker(theme?.panelAccentColor ?? '#46f4bc'),
  ];
  endpointMarkers.forEach((marker) => world.add(marker.group));
  const hoverNodeMarker = createHoverNodeMarker(theme?.selectedColor ?? '#ffffff');
  world.add(hoverNodeMarker.group);
  const endpointMarkerLabels: [SceneLabel, SceneLabel] = [
    makeSceneLabel(labelsRoot, 'node-highlight-label'),
    makeSceneLabel(labelsRoot, 'node-highlight-label'),
  ];
  endpointMarkerLabels.forEach((label) => labels.push(label));
  const nodeHighlightMarkers: NodeHighlightMarker[] = Array.from({ length: NODE_HIGHLIGHT_MARKER_LIMIT }, () => {
    const marker = createEndpointMarker(theme?.panelAccentColor ?? '#46f4bc');
    const label = makeSceneLabel(labelsRoot, 'node-highlight-label subtle');
    labels.push(label);
    world.add(marker.group);
    return { label, marker };
  });
  const rankedPlanetNodes = new Map<PlanetSizingMode, GraphNode<NMeta>[]>();

  function maxDegreeForMode(mode: PlanetSizingMode) {
    return getMaxDegreeForMode(dataset.nodes, nodeDegrees, mode, activeGroup);
  }

  function selectPlanetOverlayNodes() {
    return selectPlanetOverlayNodesBySizing(
      nodeIndex,
      dataset.nodes,
      nodeDegrees,
      planetSizing.mode,
      activeGroup,
      MAJOR_PLANET_LIMIT_ALL,
      MAJOR_PLANET_LIMIT_GROUP,
      rankedPlanetNodes,
    );
  }

  function planetSizeMultiplier(node: GraphNode<NMeta>, maxDegree = maxDegreeForMode(planetSizing.mode)) {
    return planetSizeMultiplierForDegree(nodeDegrees.get(node.id), planetSizing, maxDegree);
  }

  function planetRadius(node: GraphNode<NMeta>, maxDegree?: number) {
    return accessors.nodeSize(node) * PLANET_RADIUS_FACTOR * planetSizeMultiplier(node, maxDegree);
  }

  function addIncidentEdge(nodeId: string, edgeId: string) {
    const edgeIds = incidentEdgeIdsByNodeId.get(nodeId) ?? new Set<string>();
    edgeIds.add(edgeId);
    incidentEdgeIdsByNodeId.set(nodeId, edgeIds);
  }

  function addNeighborNode(sourceNodeId: string, targetNodeId: string) {
    const neighbors = neighborNodeIdsByNodeId.get(sourceNodeId) ?? new Set<string>();
    neighbors.add(targetNodeId);
    neighborNodeIdsByNodeId.set(sourceNodeId, neighbors);
  }

  function indexSelectableEdge(edgeId: string, edge: GraphEdge<EMeta>) {
    const hasSourceNode = nodeLookup.has(edge.source);
    const hasTargetNode = nodeLookup.has(edge.target);

    if (hasSourceNode) addIncidentEdge(edge.source, edgeId);
    if (hasTargetNode) addIncidentEdge(edge.target, edgeId);

    if (hasSourceNode && hasTargetNode) {
      addNeighborNode(edge.source, edge.target);
      addNeighborNode(edge.target, edge.source);
    }
  }

  function getNodeSelectionHighlight(nodeId: string): NodeSelectionHighlight {
    const connectedEdgeIds = new Set(incidentEdgeIdsByNodeId.get(nodeId) ?? []);
    const firstDegreeNodeIds = new Set(neighborNodeIdsByNodeId.get(nodeId) ?? []);
    const secondDegreeNodeIds = new Set<string>();

    firstDegreeNodeIds.forEach((firstDegreeNodeId) => {
      neighborNodeIdsByNodeId.get(firstDegreeNodeId)?.forEach((secondDegreeNodeId) => {
        if (secondDegreeNodeId !== nodeId && !firstDegreeNodeIds.has(secondDegreeNodeId)) {
          secondDegreeNodeIds.add(secondDegreeNodeId);
        }
      });
    });

    return { connectedEdgeIds, firstDegreeNodeIds, secondDegreeNodeIds };
  }

  function nodeMarkerLabelPosition(endpoint: SceneEdgeEndpoint) {
    return endpoint.position
      .clone()
      .add(
        new THREE.Vector3(
          Math.max(NODE_MARKER_LABEL_MIN_X, endpoint.radius * NODE_MARKER_LABEL_OFFSET_X),
          Math.max(NODE_MARKER_LABEL_MIN_Y, endpoint.radius * NODE_MARKER_LABEL_OFFSET_Y),
          0,
        ),
      );
  }

  function setEndpointMarkerLabel(label: SceneLabel, endpoint: SceneEdgeEndpoint | null) {
    const node = endpoint?.isNode ? (nodeLookup.get(endpoint.id) ?? null) : null;
    const labelText = node ? nodeDisplayLabel(node, accessors) : null;
    setSceneLabel(label, labelText, labelText && endpoint ? nodeMarkerLabelPosition(endpoint) : null);
  }

  function rankedHighlightNodeIds(ids: Iterable<string>, limit: number) {
    return Array.from(ids)
      .filter((id) => nodePositions.has(id))
      .sort((left, right) => (nodeDegrees.get(right)?.total ?? 0) - (nodeDegrees.get(left)?.total ?? 0))
      .slice(0, limit);
  }

  function rankedRelationshipEdgeIds(ids: Iterable<string>, limit: number) {
    return Array.from(ids)
      .filter((id) => edgeStates.has(id) && id !== selectedEdgeId)
      .sort((left, right) => {
        const leftState = edgeStates.get(left);
        const rightState = edgeStates.get(right);
        const leftWeight = leftState ? accessors.edgeWeight(leftState.edge) : 0;
        const rightWeight = rightState ? accessors.edgeWeight(rightState.edge) : 0;
        return rightWeight - leftWeight || left.localeCompare(right);
      })
      .slice(0, limit);
  }

  function setNodeHighlightMarker(entry: NodeHighlightMarker, nodeId: string, level: 1 | 2) {
    const endpoint = resolveEndpoint(nodeId, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius);
    const node = nodeLookup.get(nodeId) ?? null;
    const labelText = node ? nodeDisplayLabel(node, accessors) : null;
    const color = level === 2 ? (theme?.panelAccentColor ?? '#46f4bc') : (theme?.selectedColor ?? '#d8fff3');
    setMarkerVisible(
      entry.marker,
      endpoint,
      color,
      level === 2 ? HIGHLIGHT_MARKER_SCALE_NEAR : HIGHLIGHT_MARKER_SCALE_FAR,
      level === 2 ? HIGHLIGHT_MARKER_STRENGTH_NEAR : HIGHLIGHT_MARKER_STRENGTH_FAR,
    );
    setBloomLayer(entry.marker.group, Boolean(endpoint));
    setSceneLabel(entry.label, labelText, labelText && endpoint ? nodeMarkerLabelPosition(endpoint) : null);
    entry.label.element.classList.toggle('subtle', level === 1);
  }

  function updateNodeHighlightMarkers() {
    const firstDegreeNodeIds = selectedNodeHighlight
      ? rankedHighlightNodeIds(selectedNodeHighlight.firstDegreeNodeIds, NODE_HIGHLIGHT_FIRST_DEGREE_LIMIT)
      : [];
    const secondDegreeNodeIds = selectedNodeHighlight
      ? rankedHighlightNodeIds(selectedNodeHighlight.secondDegreeNodeIds, NODE_HIGHLIGHT_SECOND_DEGREE_LIMIT)
      : [];
    const highlightedNodeIds = [
      ...firstDegreeNodeIds.map((nodeId) => ({ level: 2 as const, nodeId })),
      ...secondDegreeNodeIds.map((nodeId) => ({ level: 1 as const, nodeId })),
    ];

    nodeHighlightMarkers.forEach((entry, index) => {
      const highlightedNode = highlightedNodeIds[index];
      if (!highlightedNode) {
        setMarkerVisible(entry.marker, null, theme?.panelAccentColor ?? '#46f4bc', 1);
        setBloomLayer(entry.marker.group, false);
        setSceneLabel(entry.label, null, null);
        return;
      }

      setNodeHighlightMarker(entry, highlightedNode.nodeId, highlightedNode.level);
    });
  }

  function updateSelectedRelationshipLabels() {
    const edgeIds = selectedNodeHighlight
      ? rankedRelationshipEdgeIds(selectedNodeHighlight.connectedEdgeIds, SELECTED_NODE_RELATIONSHIP_LABEL_LIMIT)
      : [];

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

  function getNodeImageTexture(imageUrl: string) {
    const existing = nodeImageTextures.get(imageUrl);
    if (existing) return existing;

    const texture = nodeImageLoader.load(imageUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(NODE_IMAGE_MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
    nodeImageTextures.set(imageUrl, texture);
    return texture;
  }

  function updateNodeImageSprite(index: number, node: GraphNode<NMeta>, position: Vec3, planetScale: number) {
    const sprite = nodeImageSprites[index];
    const imageUrl = accessors.nodeImage(node);
    if (!imageUrl) {
      sprite.visible = false;
      sprite.userData.nodeId = '';
      return;
    }

    const material = sprite.material as THREE.SpriteMaterial;
    const texture = getNodeImageTexture(imageUrl);
    if (material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }

    const spriteScale = Math.max(planetScale * NODE_IMAGE_SCALE_FACTOR, NODE_IMAGE_MIN_SCALE);
    sprite.position.set(position.x, position.y, position.z);
    sprite.scale.set(spriteScale, spriteScale, 1);
    sprite.userData.nodeId = node.id;
    sprite.visible = true;
  }

  function updatePointVisibility() {
    const selectedEndpointNodeIds = new Set<string>();
    const selectedEndpoints = selectedEdgeId ? (edgeEndpoints.get(selectedEdgeId) ?? null) : null;
    if (selectedEndpoints?.source.isNode) selectedEndpointNodeIds.add(selectedEndpoints.source.id);
    if (selectedEndpoints?.target.isNode) selectedEndpointNodeIds.add(selectedEndpoints.target.id);

    visiblePointSizes.fill(0);
    dataset.nodes.forEach((node, index) => {
      const baseColorOffset = index * 3;
      const selected = selectedNodeId === node.id;
      const firstDegree =
        selectedEndpointNodeIds.has(node.id) || Boolean(selectedNodeHighlight?.firstDegreeNodeIds.has(node.id));
      const secondDegree = Boolean(selectedNodeHighlight?.secondDegreeNodeIds.has(node.id));
      const highlightLevel = selected ? 3 : firstDegree ? 2 : secondDegree ? 1 : 0;
      const visibleByGroup = activeGroup === null || node.group === activeGroup;

      if (!visibleByGroup && highlightLevel === 0) {
        pointColors[baseColorOffset] = basePointColors[baseColorOffset] * DIMMED_POINT_COLOR_FACTOR;
        pointColors[baseColorOffset + 1] = basePointColors[baseColorOffset + 1] * DIMMED_POINT_COLOR_FACTOR;
        pointColors[baseColorOffset + 2] = basePointColors[baseColorOffset + 2] * DIMMED_POINT_COLOR_FACTOR;
        return;
      }

      const baseSize = basePointSizes[index];
      const sizeMultiplier =
        highlightLevel === 3
          ? POINT_SIZE_SELECTED
          : highlightLevel === 2
            ? POINT_SIZE_FIRST_DEGREE
            : highlightLevel === 1
              ? POINT_SIZE_SECOND_DEGREE
              : 1;
      visiblePointSizes[index] =
        visibleByGroup || highlightLevel > 0 ? Math.max(baseSize * sizeMultiplier, baseSize + highlightLevel) : 0;

      tmpPointSelectionColor.setRGB(
        basePointColors[baseColorOffset],
        basePointColors[baseColorOffset + 1],
        basePointColors[baseColorOffset + 2],
      );

      if (highlightLevel === 3) tmpPointSelectionColor.set('#ffffff');
      else if (highlightLevel === 2)
        tmpPointSelectionColor.lerp(
          tmpPointSelectionTargetColor.set(theme?.panelAccentColor ?? '#46f4bc'),
          POINT_FIRST_DEGREE_TINT,
        );
      else if (highlightLevel === 1)
        tmpPointSelectionColor.lerp(
          tmpPointSelectionTargetColor.set(theme?.selectedColor ?? '#d8fff3'),
          POINT_SECOND_DEGREE_TINT,
        );
      else if (selectedNodeId || selectedEdgeId) tmpPointSelectionColor.multiplyScalar(POINT_UNRELATED_DIM);

      pointColors[baseColorOffset] = tmpPointSelectionColor.r;
      pointColors[baseColorOffset + 1] = tmpPointSelectionColor.g;
      pointColors[baseColorOffset + 2] = tmpPointSelectionColor.b;
    });
    pointColorAttribute.needsUpdate = true;
    pointSizeAttribute.needsUpdate = true;
  }

  function updatePointAppearance() {
    dataset.nodes.forEach((node, index) => {
      const pointColor = pointCloudColor(accessors.nodeColor(node));
      basePointColors[index * 3] = pointColor.r;
      basePointColors[index * 3 + 1] = pointColor.g;
      basePointColors[index * 3 + 2] = pointColor.b;
      basePointSizes[index] = accessors.nodeSize(node);
    });
    updatePointVisibility();
  }

  function updateMajorOverlay() {
    const majorNodes = selectPlanetOverlayNodes();
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    const selectedEndpoints = selectedEdgeId ? (edgeEndpoints.get(selectedEdgeId) ?? null) : null;
    const maxDegree = maxDegreeForMode(planetSizing.mode);
    planetInstanceNodeIds.length = 0;
    planetMesh.count = majorNodes.length;
    let ringIndex = 0;

    majorNodes.forEach((node, index) => {
      const position = nodePositions.get(node.id)!;
      const nodeSize = accessors.nodeSize(node);
      const nodeColor = accessors.nodeColor(node);
      const radius = planetRadius(node, maxDegree);
      const selected = selectedNodeId === node.id;
      const relatedToSelectedEdge = Boolean(
        selectedEndpoints && (selectedEndpoints.source.id === node.id || selectedEndpoints.target.id === node.id),
      );
      const firstDegree = Boolean(selectedNodeHighlight?.firstDegreeNodeIds.has(node.id));
      const secondDegree = Boolean(selectedNodeHighlight?.secondDegreeNodeIds.has(node.id));
      const hovered = hoveredNodeId === node.id;
      const selectionEmphasized = selected || relatedToSelectedEdge || firstDegree || secondDegree;
      const emphasized = selectionEmphasized || hovered;
      const planetScale =
        radius *
        (selected
          ? PLANET_SCALE_SELECTED
          : relatedToSelectedEdge || firstDegree
            ? PLANET_SCALE_RELATED
            : secondDegree
              ? PLANET_SCALE_SECOND_DEGREE
              : hovered
                ? PLANET_SCALE_HOVERED
                : 1);
      const ringScale =
        radius *
        RING_SCALE_BASE *
        (selected
          ? RING_SCALE_SELECTED
          : relatedToSelectedEdge || firstDegree
            ? RING_SCALE_RELATED
            : secondDegree
              ? RING_SCALE_SECOND_DEGREE
              : hovered
                ? RING_SCALE_HOVERED
                : RING_SCALE_IDLE);
      const color = selectionEmphasized
        ? new THREE.Color(
            selected
              ? '#ffffff'
              : relatedToSelectedEdge || firstDegree
                ? (theme?.panelAccentColor ?? '#46f4bc')
                : (theme?.selectedColor ?? '#d8fff3'),
          )
        : hovered
          ? planetColor(nodeColor).multiplyScalar(PLANET_HOVER_BRIGHTEN)
          : hasSelection
            ? dimColor(nodeColor, DIM_COLOR_MULTIPLIER)
            : planetColor(nodeColor);

      instanceDummy.position.set(position.x, position.y, position.z);
      instanceDummy.rotation.set(0, (index % PLANET_YAW_CYCLE) * PLANET_YAW_STEP, 0);
      instanceDummy.scale.setScalar(planetScale);
      instanceDummy.updateMatrix();
      planetMesh.setMatrixAt(index, instanceDummy.matrix);
      planetMesh.setColorAt(index, color);
      updateNodeImageSprite(index, node, position, planetScale);

      if (accessors.nodeRing(node)) {
        instanceDummy.position.set(position.x, position.y, position.z);
        instanceDummy.rotation.set(RING_TILT_X, RING_TILT_Y, Math.PI * ((index % PLANET_YAW_CYCLE) / PLANET_YAW_CYCLE));
        instanceDummy.scale.setScalar(ringScale);
        instanceDummy.updateMatrix();
        ringMesh.setMatrixAt(ringIndex, instanceDummy.matrix);
        ringMesh.setColorAt(ringIndex, emphasized ? new THREE.Color(theme?.selectedColor ?? '#d8fff3') : color);
        ringIndex += 1;
      }

      planetInstanceNodeIds[index] = node.id;

      const label = nodeLabelPool[index];
      const labelText = !emphasized && shouldShowMajorLabel(index, activeGroup) ? accessors.nodeLabel(node) : null;
      setSceneLabel(
        label,
        labelText,
        labelText === null
          ? null
          : new THREE.Vector3(
              position.x,
              position.y + Math.max(nodeSize * MAJOR_LABEL_NODE_SIZE_FACTOR, radius * MAJOR_LABEL_RADIUS_FACTOR),
              position.z,
            ),
      );
    });

    for (let index = majorNodes.length; index < nodeLabelPool.length; index += 1) {
      setSceneLabel(nodeLabelPool[index], null, null);
      planetInstanceNodeIds[index] = '';
      nodeImageSprites[index].visible = false;
      nodeImageSprites[index].userData.nodeId = '';
    }

    ringMesh.count = ringIndex;
    planetMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    if (planetMesh.instanceColor) planetMesh.instanceColor.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  }

  function updateClusterVisibility() {
    let visibleClusterIndex = 0;
    clusterVisuals.forEach((clusterVisual) => {
      const visibleByGroup = activeGroup === null || clusterVisual.group === activeGroup;
      const visible = showClusters && visibleByGroup;
      const scale = clusterVisual.radius * (galaxyMode ? CLUSTER_SPRITE_SCALE_GALAXY : CLUSTER_SPRITE_SCALE_DEFAULT);
      clusterVisual.sprite.visible = visible;
      clusterVisual.sprite.scale.set(scale, scale, 1);

      const shouldLabel = visible && shouldShowClusterLabel(visibleClusterIndex, activeGroup);
      clusterVisual.label.active = shouldLabel;
      clusterVisual.label.element.textContent = shouldLabel ? clusterVisual.labelText : '';
      clusterVisual.label.element.style.display = shouldLabel ? clusterVisual.label.element.style.display : 'none';
      if (visibleByGroup) visibleClusterIndex += 1;
    });
  }

  function replaceEdgeVisualAttributes() {
    edgePositionAttribute = new THREE.BufferAttribute(edgePositions, 3);
    edgeNormalAttribute = new THREE.BufferAttribute(edgeNormals, 3);
    edgeColorAttribute = new THREE.BufferAttribute(edgeColors, 3);
    edgeBaseOpacityAttribute = new THREE.BufferAttribute(edgeBaseOpacities, 1);
    edgeStateAttribute = new THREE.BufferAttribute(edgeStatesAttribute, 1);
    edgeFlowAttribute = new THREE.BufferAttribute(edgeFlows, 1);
    edgeColorAttribute.setUsage(THREE.DynamicDrawUsage);
    edgeStateAttribute.setUsage(THREE.DynamicDrawUsage);
    edgeVisualGeometry.setAttribute('position', edgePositionAttribute);
    edgeVisualGeometry.setAttribute('normal', edgeNormalAttribute);
    edgeVisualGeometry.setAttribute('aColor', edgeColorAttribute);
    edgeVisualGeometry.setAttribute('aBaseOpacity', edgeBaseOpacityAttribute);
    edgeVisualGeometry.setAttribute('aState', edgeStateAttribute);
    edgeVisualGeometry.setAttribute('aFlow', edgeFlowAttribute);
  }

  function growEdgeVisualBuffers(requiredVertexCount: number) {
    if (requiredVertexCount <= edgeVisualCapacity) return;

    const nextCapacity = Math.max(
      requiredVertexCount,
      Math.ceil(edgeVisualCapacity * POINT_CAPACITY_GROWTH_FACTOR) + POINT_CAPACITY_GROWTH_PAD,
    );
    const grow = (source: Float32Array, stride: number) => {
      const next = new Float32Array(nextCapacity * stride);
      next.set(source.subarray(0, edgeVisualVertexCount * stride));
      return next;
    };

    edgePositions = grow(edgePositions, 3);
    edgeNormals = grow(edgeNormals, 3);
    edgeColors = grow(edgeColors, 3);
    edgeBaseOpacities = grow(edgeBaseOpacities, 1);
    edgeStatesAttribute = grow(edgeStatesAttribute, 1);
    edgeFlows = grow(edgeFlows, 1);
    edgeVisualCapacity = nextCapacity;
    replaceEdgeVisualAttributes();
  }

  function writeEdgeVisualRange(
    range: EdgeVisualRange,
    geometry: THREE.BufferGeometry,
    color: THREE.Color,
    baseOpacity: number,
  ) {
    const sourcePosition = geometry.getAttribute('position');
    const sourceNormal = geometry.getAttribute('normal');
    if (!sourcePosition || !sourceNormal) return;

    for (let vertex = 0; vertex < range.count; vertex += 1) {
      const sourceOffset = vertex * 3;
      const targetVertex = range.start + vertex;
      const targetOffset = targetVertex * 3;
      edgePositions[targetOffset] = sourcePosition.array[sourceOffset];
      edgePositions[targetOffset + 1] = sourcePosition.array[sourceOffset + 1];
      edgePositions[targetOffset + 2] = sourcePosition.array[sourceOffset + 2];
      edgeNormals[targetOffset] = sourceNormal.array[sourceOffset];
      edgeNormals[targetOffset + 1] = sourceNormal.array[sourceOffset + 1];
      edgeNormals[targetOffset + 2] = sourceNormal.array[sourceOffset + 2];
      edgeColors[targetOffset] = color.r;
      edgeColors[targetOffset + 1] = color.g;
      edgeColors[targetOffset + 2] = color.b;
      edgeBaseOpacities[targetVertex] = baseOpacity;
      edgeFlows[targetVertex] = range.count > 1 ? vertex / (range.count - 1) : 0;
    }
  }

  function markEdgeVisualGeometryUpdated() {
    edgePositionAttribute.needsUpdate = true;
    edgeNormalAttribute.needsUpdate = true;
    edgeColorAttribute.needsUpdate = true;
    edgeBaseOpacityAttribute.needsUpdate = true;
    edgeStateAttribute.needsUpdate = true;
    edgeFlowAttribute.needsUpdate = true;
    edgeVisualGeometry.setDrawRange(0, edgeVisualVertexCount);
    edgeVisualGeometry.computeBoundingSphere();
  }

  function allocateEdgeVisualRange(edgeId: string, geometry: THREE.BufferGeometry) {
    const vertexCount = geometry.getAttribute('position')?.count ?? 0;
    const range = { start: edgeVisualVertexCount, count: vertexCount };
    growEdgeVisualBuffers(edgeVisualVertexCount + vertexCount);
    edgeVisualVertexCount += vertexCount;
    edgeVisualRanges.set(edgeId, range);
    return range;
  }

  function setEdgeRangeState(range: EdgeVisualRange | null, stateValue: number, color: THREE.Color) {
    if (!range) return;
    for (let vertex = range.start; vertex < range.start + range.count; vertex += 1) {
      const colorOffset = vertex * 3;
      edgeStatesAttribute[vertex] = stateValue;
      edgeColors[colorOffset] = color.r;
      edgeColors[colorOffset + 1] = color.g;
      edgeColors[colorOffset + 2] = color.b;
    }
  }

  // Source geometry written into the merged edge buffer: a sampled polyline in scale
  // (line) mode, a tube in quality mode. Both expose position+normal so the range
  // writer is identical; only the per-edge vertex count differs (~16 vs ~1000).
  function edgeVisualSourceGeometry(spec: ReturnType<typeof getEdgeSpec>) {
    return edgeRenderMode === 'line'
      ? createEdgeLineGeometry(spec.curve, EDGE_LINE_SEGMENTS)
      : createTubeGeometry(spec.curve, spec.visualSegments, spec.radius).toNonIndexed();
  }

  function refreshEdgeGeometry(state: EdgeVisualState<EMeta>) {
    const source = resolveEndpoint(
      state.edge.source,
      nodeLookup,
      nodePositions,
      clusterLookup,
      accessors,
      planetRadius,
    );
    const target = resolveEndpoint(
      state.edge.target,
      nodeLookup,
      nodePositions,
      clusterLookup,
      accessors,
      planetRadius,
    );
    if (!source || !target) {
      state.visible = false;
      if (state.hit) state.hit.userData.pickable = false;
      edgeEndpoints.delete(state.id);
      return;
    }

    state.endpoints = { source, target };
    edgeEndpoints.set(state.id, state.endpoints);
    const spec = getEdgeSpec(state.edge, state.endpoints, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode);
    const appearanceKey = `${spec.color}:${spec.opacity.toFixed(4)}`;
    if (state.geometryKey !== spec.geometryKey || state.appearanceKey !== appearanceKey) {
      const visualGeometry = edgeVisualSourceGeometry(spec);
      const vertexCount = visualGeometry.getAttribute('position').count;
      const canReuseRange = Boolean(state.visualRange && state.visualRange.count === vertexCount);
      if (state.visualRange && !canReuseRange) {
        setEdgeRangeState(state.visualRange, 0, tmpEdgeAppearanceColor.set(spec.color));
      }
      const range = canReuseRange ? state.visualRange! : allocateEdgeVisualRange(state.id, visualGeometry);
      writeEdgeVisualRange(range, visualGeometry, tmpEdgeAppearanceColor.set(spec.color), spec.opacity);
      state.visualRange = range;
      visualGeometry.dispose();
      if (state.hit) {
        state.hit.geometry.dispose();
        state.hit.geometry = createTubeGeometry(spec.curve, spec.hitSegments, spec.hitRadius);
      }
      state.geometryKey = spec.geometryKey;
      state.appearanceKey = appearanceKey;
      state.baseOpacity = spec.opacity;
    }

    if (state.hit) (state.hit.material as THREE.MeshBasicMaterial).color.set(spec.color);
  }

  function updateEdgeVisibility() {
    edgeStates.forEach((state) => {
      const visibleByGroup = edgeMatchesActiveGroup(
        state.endpoints.source.group,
        state.endpoints.target.group,
        activeGroup,
      );
      const selected = selectedEdgeId === state.id;
      const connectedToSelectedNode = Boolean(selectedNodeHighlight?.connectedEdgeIds.has(state.id));
      const visible = visibleByGroup || selected || connectedToSelectedNode;
      state.visible = visible;
      if (state.hit) state.hit.userData.pickable = visible;
    });
  }

  function updateEdges() {
    edgeStates.forEach((state) => refreshEdgeGeometry(state));
    updateEdgeVisibility();
    applyEdgeAppearance();
    markEdgeVisualGeometryUpdated();
  }

  function addEdgeMesh(edge: GraphEdge<EMeta>, index: number) {
    const source = resolveEndpoint(edge.source, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius);
    const target = resolveEndpoint(edge.target, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius);
    if (!source || !target) return;

    const edgeId = getEdgeId(edge, index);
    const endpoints = { source, target };
    const spec = getEdgeSpec(edge, endpoints, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode);
    const visualGeometry = edgeVisualSourceGeometry(spec);
    const visualRange = allocateEdgeVisualRange(edgeId, visualGeometry);
    writeEdgeVisualRange(visualRange, visualGeometry, tmpEdgeAppearanceColor.set(spec.color), spec.opacity);
    visualGeometry.dispose();

    // Quality mode keeps a per-edge invisible hit tube for raycast picking. Scale (line)
    // mode skips it: at 100k+ edges that is 100k+ Object3Ds plus an O(N) array spread and
    // raycast on every pointermove. Edge highlighting still works there via node selection
    // (connectedEdgeIds drives aState); only direct edge-click picking is unavailable.
    let hit: THREE.Mesh | null = null;
    if (edgeRenderMode === 'tube') {
      hit = new THREE.Mesh(
        createTubeGeometry(spec.curve, spec.hitSegments, spec.hitRadius),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      hit.userData.edgeId = edgeId;
      hit.userData.type = 'edge';
      hit.userData.pickable = true;
      // The hit tube never renders: its additive material is fully transparent so it
      // contributes nothing to the image, and three.js raycasting ignores `visible`.
      // Keeping it invisible removes one draw call per edge (halving edge draw calls)
      // while it remains pickable; eligibility is gated by userData.pickable instead.
      hit.visible = false;
      interactiveEdgeMeshes.push(hit);
      world.add(hit);
    }

    const state = {
      appearanceKey: `${spec.color}:${spec.opacity.toFixed(4)}`,
      baseOpacity: spec.opacity,
      edge,
      endpoints,
      geometryKey: spec.geometryKey,
      hit,
      id: edgeId,
      visible: true,
      visualRange,
    };
    edgeStates.set(edgeId, state);
    edgeLookup.set(edgeId, edge);
    edgeEndpoints.set(edgeId, endpoints);
    indexSelectableEdge(edgeId, edge);
  }

  dataset.edges.forEach(addEdgeMesh);
  markEdgeVisualGeometryUpdated();

  // Grow (and lazily reallocate) the point-cloud buffers to cover `nextCount` nodes,
  // seeding positions for the appended tail. Used by the incremental append path so a
  // streamed chunk never rebuilds the whole point cloud.
  function growPointBuffers(prevCount: number, nextCount: number) {
    if (nextCount > pointCapacity) {
      const nextCapacity = Math.max(
        nextCount,
        Math.ceil(pointCapacity * POINT_CAPACITY_GROWTH_FACTOR) + POINT_CAPACITY_GROWTH_PAD,
      );
      const grow = (source: Float32Array, stride: number) => {
        const next = new Float32Array(nextCapacity * stride);
        next.set(source.subarray(0, prevCount * stride));
        return next;
      };
      pointPositions = grow(pointPositions, 3);
      basePointColors = grow(basePointColors, 3);
      pointColors = grow(pointColors, 3);
      basePointSizes = grow(basePointSizes, 1);
      visiblePointSizes = grow(visiblePointSizes, 1);
      pointCapacity = nextCapacity;

      pointColorAttribute = new THREE.BufferAttribute(pointColors, 3);
      pointSizeAttribute = new THREE.BufferAttribute(visiblePointSizes, 1);
      pointColorAttribute.setUsage(THREE.DynamicDrawUsage);
      pointSizeAttribute.setUsage(THREE.DynamicDrawUsage);
      pointsGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
      pointsGeometry.setAttribute('color', pointColorAttribute);
      pointsGeometry.setAttribute('size', pointSizeAttribute);
    }

    for (let index = prevCount; index < nextCount; index += 1) {
      const node = dataset.nodes[index];
      const position = nodePositions.get(node.id);
      if (!position) continue;
      pointPositions[index * 3] = position.x;
      pointPositions[index * 3 + 1] = position.y;
      pointPositions[index * 3 + 2] = position.z;
    }
    (pointsGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    pointsGeometry.setDrawRange(0, nextCount);
    pointsGeometry.computeBoundingSphere();
  }

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
    rankedPlanetNodes.clear();

    if (newNodes.length) growPointBuffers(prevNodeCount, dataset.nodes.length);

    for (let index = prevEdgeCount; index < dataset.edges.length; index += 1) {
      addEdgeMesh(dataset.edges[index], index);
    }

    // Streamed growth can cross the density threshold, so recompute the adaptive
    // opacity scale from the new totals.
    pointsMaterial.uniforms.densityScale.value = resolveDensityScale(dataset.nodes.length);
    edgeVisualMaterial.uniforms.densityScale.value = resolveDensityScale(dataset.edges.length);

    updatePointAppearance();
    updateEdges();
    updateClusterVisibility();
    updateSelection(selectedNodeId, selectedEdgeId);
    updateHoverHighlight();
    needsRender = true;
  }

  const edgeBloomEmptyGeometry = new THREE.BufferGeometry();
  const edgeBloomMaterial = new THREE.MeshBasicMaterial({
    color: theme?.panelAccentColor ?? '#46f4bc',
    vertexColors: true,
    transparent: true,
    opacity: HOVER_EDGE_OVERLAY_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const edgeBloomBatch = new THREE.Mesh(edgeBloomEmptyGeometry, edgeBloomMaterial);
  edgeBloomBatch.renderOrder = 19;
  edgeBloomBatch.visible = false;
  edgeBloomBatch.layers.set(BLOOM_LAYER);
  world.add(edgeBloomBatch);
  let edgeBloomGeometry: THREE.BufferGeometry | null = null;
  refreshBloomActive = () => {
    bloomActive =
      edgeBloomBatch.visible ||
      hoverNodeMarker.group.visible ||
      endpointMarkers.some((marker) => marker.group.visible) ||
      nodeHighlightMarkers.some(({ marker }) => marker.group.visible);
  };

  function appendEdgeBloomGeometry(
    positions: number[],
    colors: number[],
    state: EdgeVisualState<EMeta>,
    color: THREE.Color,
    radiusFactor: number,
  ) {
    const spec = getEdgeSpec(state.edge, state.endpoints, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode);
    const geometry = createTubeGeometry(spec.curve, spec.visualSegments, spec.radius * radiusFactor).toNonIndexed();
    const position = geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      colors.push(color.r, color.g, color.b);
    }
    geometry.dispose();
  }

  function rebuildEdgeBloomBatch() {
    const positions: number[] = [];
    const colors: number[] = [];

    edgeStates.forEach((state) => {
      if (!state.visible) return;
      const selected = selectedEdgeId === state.id;
      const hovered = hoveredEdgeId === state.id;
      const connectedToSelectedNode = Boolean(selectedNodeHighlight?.connectedEdgeIds.has(state.id));
      if (!selected && !hovered && !connectedToSelectedNode) return;

      const color = tmpEdgeAppearanceColor.set(
        selected
          ? '#ffffff'
          : hovered || connectedToSelectedNode
            ? (theme?.panelAccentColor ?? '#46f4bc')
            : accessors.edgeColor(state.edge),
      );
      appendEdgeBloomGeometry(positions, colors, state, color, hovered ? HOVER_EDGE_RADIUS_FACTOR : 1.25);
    });

    edgeBloomGeometry?.dispose();
    if (!positions.length) {
      edgeBloomGeometry = null;
      edgeBloomBatch.geometry = edgeBloomEmptyGeometry;
      edgeBloomBatch.visible = false;
      refreshBloomActive?.();
      return;
    }

    edgeBloomGeometry = new THREE.BufferGeometry();
    edgeBloomGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    edgeBloomGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    edgeBloomGeometry.computeBoundingSphere();
    edgeBloomBatch.geometry = edgeBloomGeometry;
    edgeBloomBatch.visible = true;
    refreshBloomActive?.();
  }

  function applyEdgeAppearance() {
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    edgeStates.forEach((state) => {
      const selected = selectedEdgeId === state.id;
      const connectedToSelectedNode = Boolean(selectedNodeHighlight?.connectedEdgeIds.has(state.id));
      const hovered = hoveredEdgeId === state.id;
      let stateValue = state.visible ? EDGE_STATE_VISIBLE : 0;
      if (selected) stateValue += EDGE_STATE_SELECTED;
      if (hovered) stateValue += EDGE_STATE_HOVERED;
      if (connectedToSelectedNode) stateValue += EDGE_STATE_CONNECTED;
      if (hasSelection && !selected && !hovered && !connectedToSelectedNode) stateValue += EDGE_STATE_DIMMED;
      tmpEdgeAppearanceColor.set(
        selected
          ? '#ffffff'
          : hovered
            ? (theme?.panelAccentColor ?? '#46f4bc')
            : connectedToSelectedNode
              ? (theme?.panelAccentColor ?? '#46f4bc')
              : accessors.edgeColor(state.edge),
      );
      setEdgeRangeState(state.visualRange, stateValue, tmpEdgeAppearanceColor);
    });
    edgeColorAttribute.needsUpdate = true;
    edgeStateAttribute.needsUpdate = true;
    rebuildEdgeBloomBatch();
  }

  function updateHoverHighlight() {
    const hoveredEndpoint = hoveredNodeId
      ? resolveEndpoint(hoveredNodeId, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius)
      : null;
    setHoverNodeMarkerVisible(hoverNodeMarker, hoveredEndpoint, theme?.panelAccentColor ?? '#46f4bc');
    setBloomLayer(hoverNodeMarker.group, Boolean(hoveredEndpoint));
    updateMajorOverlay();
    applyEdgeAppearance();
  }

  function updateSelection(nextSelectedNodeId: string | null, nextSelectedEdgeId: string | null) {
    selectedNodeId = nextSelectedNodeId;
    selectedEdgeId = nextSelectedEdgeId;
    selectedNodeHighlight = selectedNodeId ? getNodeSelectionHighlight(selectedNodeId) : null;
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    const selectedEndpoints = selectedEdgeId ? (edgeEndpoints.get(selectedEdgeId) ?? null) : null;
    const selectedEdgeState = selectedEdgeId ? (edgeStates.get(selectedEdgeId) ?? null) : null;
    const selectedNodeEndpoint = selectedNodeId
      ? resolveEndpoint(selectedNodeId, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius)
      : null;
    const primaryEndpoint = selectedEndpoints?.source ?? selectedNodeEndpoint;
    const secondaryEndpoint = selectedEndpoints?.target ?? null;
    pointsMaterial.uniforms.globalOpacity.value = hasSelection ? SELECTION_POINT_OPACITY : 1;
    const focusPosition = selectedEndpoints
      ? selectionFocusPosition
          .copy(selectedEndpoints.source.position)
          .lerp(selectedEndpoints.target.position, EDGE_MIDPOINT_LERP)
      : (selectedNodeEndpoint?.position ?? null);
    applyFocusState(hasSelection, focusPosition);

    updatePointVisibility();
    updateMajorOverlay();
    updateEdgeVisibility();
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

    setMarkerVisible(
      endpointMarkers[0],
      primaryEndpoint,
      theme?.selectedColor ?? '#d8fff3',
      selectedNodeEndpoint || selectedEndpoints?.source.id === selectedNodeId
        ? ENDPOINT_MARKER_SCALE_PRIMARY
        : ENDPOINT_MARKER_SCALE_SECONDARY,
    );
    setBloomLayer(endpointMarkers[0].group, Boolean(primaryEndpoint));
    setMarkerVisible(
      endpointMarkers[1],
      secondaryEndpoint,
      theme?.panelAccentColor ?? '#46f4bc',
      selectedEndpoints?.target.id === selectedNodeId ? ENDPOINT_MARKER_SCALE_PRIMARY : ENDPOINT_MARKER_SCALE_SECONDARY,
    );
    setBloomLayer(endpointMarkers[1].group, Boolean(secondaryEndpoint));
    setEndpointMarkerLabel(endpointMarkerLabels[0], primaryEndpoint);
    setEndpointMarkerLabel(endpointMarkerLabels[1], secondaryEndpoint);
    updateNodeHighlightMarkers();
    updateSelectedRelationshipLabels();
    applyEdgeAppearance();
  }

  function clearHover() {
    setSceneLabel(hoverLabel, null, null);
    renderer.domElement.style.cursor = 'grab';
    hoveredNodeId = null;
    hoveredEdgeId = null;
    updateHoverHighlight();
    callbacksRef.current.onHoverNode(null);
    callbacksRef.current.onHoverEdge(null);
  }

  function updateActiveGroup(nextActiveGroup: string | null) {
    activeGroup = nextActiveGroup;
    updateClusterVisibility();
    updateEdgeVisibility();
    updateSelection(selectedNodeId, selectedEdgeId);
    clearHover();
  }

  function updateClusterVisibilityFromProp(nextShowClusters: boolean) {
    showClusters = nextShowClusters;
    updateClusterVisibility();
  }

  function updateGalaxyMode(nextGalaxyMode: boolean) {
    galaxyMode = nextGalaxyMode;
    pointsMaterial.uniforms.baseSize.value = galaxyMode ? POINT_BASE_SIZE_GALAXY : POINT_BASE_SIZE_DEFAULT;
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = galaxyMode ? FOG_DENSITY_GALAXY : FOG_DENSITY_DEFAULT;
    starGeometry.setDrawRange(0, galaxyMode ? MAX_STAR_COUNT : QUIET_STAR_COUNT);
    updateClusterVisibility();
    updateEdges();
    updateSelection(selectedNodeId, selectedEdgeId);
    updateHoverHighlight();
  }

  function updateMotionPreference(nextMotion: ResolvedGalaxyMotion) {
    motion = nextMotion;
  }

  function updatePlanetSizing(nextPlanetSizing: GalaxyPlanetSizingOptions | undefined) {
    planetSizing = resolvePlanetSizing(nextPlanetSizing);
    updatePointAppearance();
    updateEdges();
    updateSelection(selectedNodeId, selectedEdgeId);
    updateHoverHighlight();
  }

  function updateTheme(nextTheme: GalaxyGraphTheme | undefined) {
    theme = nextTheme;
    renderer.setClearColor(theme?.background ?? '#07090d', 1);
    updateSelection(selectedNodeId, selectedEdgeId);
    updateHoverHighlight();
  }

  function updateAccessors(nextAccessors: GraphAccessors<NMeta, EMeta> | undefined) {
    accessors = resolveAccessors(nextAccessors);
    updatePointAppearance();
    updateEdges();
    updateSelection(selectedNodeId, selectedEdgeId);
    updateHoverHighlight();
  }

  updatePointAppearance();
  updateClusterVisibility();
  updateEdgeVisibility();
  updateSelection(null, null);

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: POINT_PICK_THRESHOLD };
  const pointer = new THREE.Vector2();
  let animationFrame = 0;
  let frame = 0;
  const pressedKeys = new Set<string>();
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
    bloomComposer.setSize(nextWidth, nextHeight);
    finalComposer.setSize(nextWidth, nextHeight);
    pointsMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();
    needsRender = true;
  }

  function intersectAt(clientX: number, clientY: number) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([planetMesh, pointCloud, ...interactiveEdgeMeshes], false);
    const isNodeHit = (entry: THREE.Intersection) => {
      if (!entry.object.visible) return false;
      if (entry.object.userData.type === 'node-instances') {
        return entry.instanceId !== undefined && Boolean(planetInstanceNodeIds[entry.instanceId]);
      }
      if (entry.object.userData.type !== 'node-points' || entry.index === undefined) return false;
      return visiblePointSizes[entry.index] > 0;
    };
    const isEdgeHit = (entry: THREE.Intersection) =>
      Boolean(entry.object.userData.pickable) &&
      entry.object.userData.type === 'edge' &&
      Boolean(entry.object.userData.edgeId);
    const hit = hits.find((entry) => isNodeHit(entry) || isEdgeHit(entry));
    const instanceId = hit?.instanceId;
    const pointIndex = hit?.object.userData.type === 'node-points' ? hit.index : undefined;
    const nodeId =
      hit?.object.userData.type === 'node-instances' && instanceId !== undefined
        ? planetInstanceNodeIds[instanceId] || null
        : pointIndex !== undefined && visiblePointSizes[pointIndex] > 0
          ? (dataset.nodes[pointIndex]?.id ?? null)
          : null;
    const edgeId = (hit?.object.userData.edgeId as string | undefined) ?? null;
    return {
      nodeId,
      edgeId,
      node: nodeId ? (nodeLookup.get(nodeId) ?? null) : null,
      edge: edgeId ? (edgeLookup.get(edgeId) ?? null) : null,
    };
  }

  function updateHoverLabel(
    node: GraphNode<NMeta> | null,
    edge: GraphEdge<EMeta> | null,
    nodeId: string | null,
    edgeId: string | null,
  ) {
    if (node && nodeId) {
      const endpoint = resolveEndpoint(nodeId, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius);
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

  function processHover() {
    hoverPending = false;
    const { node, edge, nodeId, edgeId } = intersectAt(pendingHoverX, pendingHoverY);
    renderer.domElement.style.cursor = node || edge ? 'pointer' : 'grab';
    updateHoverLabel(node, edge, nodeId, edgeId);
    const nodeChanged = nodeId !== hoveredNodeId;
    const edgeChanged = edgeId !== hoveredEdgeId;
    if (nodeChanged || edgeChanged) {
      hoveredNodeId = nodeId;
      hoveredEdgeId = edgeId;
      updateHoverHighlight();
    }
    if (nodeChanged) {
      callbacksRef.current.onHoverNode(node);
    }
    if (edgeChanged) {
      callbacksRef.current.onHoverEdge(edge);
    }
  }

  function processSelect(clientX: number, clientY: number) {
    const { node, edge } = intersectAt(clientX, clientY);
    if (node) {
      callbacksRef.current.onSelectEdge(null);
      callbacksRef.current.onSelectNode(node);
      return;
    }
    if (edge) {
      callbacksRef.current.onSelectNode(null);
      callbacksRef.current.onSelectEdge(edge);
      return;
    }
    callbacksRef.current.onSelectNode(null);
    callbacksRef.current.onSelectEdge(null);
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

  function focusNode(nodeId: string) {
    const node = nodeLookup.get(nodeId);
    const position = node ? nodePositions.get(node.id) : undefined;
    if (!node || !position) return;
    const target = new THREE.Vector3(position.x, position.y, position.z).applyQuaternion(world.quaternion);
    const nodeSize = Math.max(accessors.nodeSize(node), planetRadius(node));
    controls.target.copy(target);
    camera.position
      .copy(target)
      .add(
        new THREE.Vector3(
          nodeSize * FOCUS_NODE_OFFSET_X_SCALE + FOCUS_NODE_OFFSET_X_BASE,
          nodeSize * FOCUS_NODE_OFFSET_Y_SCALE + FOCUS_NODE_OFFSET_Y_BASE,
          nodeSize * FOCUS_NODE_OFFSET_Z_SCALE + FOCUS_NODE_OFFSET_Z_BASE,
        ),
      );
    controls.update();
    emitCameraView();
  }

  function focusEdge(edgeId: string) {
    const endpoints = edgeEndpoints.get(edgeId);
    if (!endpoints) return;

    const sourcePosition = endpoints.source.position.clone().applyQuaternion(world.quaternion);
    const targetPosition = endpoints.target.position.clone().applyQuaternion(world.quaternion);
    const midpoint = sourcePosition.clone().lerp(targetPosition, EDGE_MIDPOINT_LERP);
    const distance = Math.max(FOCUS_EDGE_MIN_DISTANCE, sourcePosition.distanceTo(targetPosition));
    controls.target.copy(midpoint);
    camera.position
      .copy(midpoint)
      .add(
        new THREE.Vector3(
          distance * FOCUS_EDGE_OFFSET_XY_SCALE + FOCUS_EDGE_OFFSET_X_BASE,
          distance * FOCUS_EDGE_OFFSET_XY_SCALE + FOCUS_EDGE_OFFSET_Y_BASE,
          distance * FOCUS_EDGE_OFFSET_Z_SCALE + FOCUS_EDGE_OFFSET_Z_BASE,
        ),
      );
    controls.update();
    emitCameraView();
  }

  function moveCamera(direction: SpaceDirection, multiplier = 1, skipUpdate = false) {
    camera.getWorldDirection(tmpDirection).normalize();
    tmpRight.crossVectors(tmpDirection, camera.up).normalize();
    tmpMove.set(0, 0, 0);

    if (direction === 'forward') tmpMove.copy(tmpDirection);
    if (direction === 'back') tmpMove.copy(tmpDirection).multiplyScalar(-1);
    if (direction === 'right') tmpMove.copy(tmpRight);
    if (direction === 'left') tmpMove.copy(tmpRight).multiplyScalar(-1);
    if (direction === 'up') tmpMove.copy(camera.up).normalize();
    if (direction === 'down') tmpMove.copy(camera.up).normalize().multiplyScalar(-1);

    const distance = CAMERA_MOVE_DISTANCE * multiplier;
    camera.position.addScaledVector(tmpMove, distance);
    controls.target.addScaledVector(tmpMove, distance);
    if (!skipUpdate) controls.update();
    emitCameraView();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      event.preventDefault();
      pressedKeys.add(key);
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    pressedKeys.delete(event.key.toLowerCase());
  }

  function resetCamera() {
    camera.position.copy(CAMERA_HOME);
    controls.target.copy(TARGET_HOME);
    controls.update();
    emitCameraView();
  }

  function handleContextLost(event: Event) {
    event.preventDefault();
    onContextLost({
      reason: 'context-lost',
      message: 'The WebGL context was lost. Use retry to rebuild the scene.',
    });
  }

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  host.addEventListener('keydown', handleKeyDown);
  host.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', resize);
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          resize();
        })
      : null;
  resizeObserver?.observe(host);
  emitCameraView();

  function animate() {
    animationFrame = window.requestAnimationFrame(animate);
    frame += 1;
    const keySpeed = pressedKeys.has('shift') ? KEY_SHIFT_BOOST : 1;
    if (pressedKeys.has('w') || pressedKeys.has('arrowup')) moveCamera('forward', keySpeed * KEY_MOVE_SPEED, true);
    if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) moveCamera('back', keySpeed * KEY_MOVE_SPEED, true);
    if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) moveCamera('left', keySpeed * KEY_MOVE_SPEED, true);
    if (pressedKeys.has('d') || pressedKeys.has('arrowright')) moveCamera('right', keySpeed * KEY_MOVE_SPEED, true);
    if (pressedKeys.has('e')) moveCamera('up', keySpeed * KEY_MOVE_SPEED_VERTICAL, true);
    if (pressedKeys.has('q')) moveCamera('down', keySpeed * KEY_MOVE_SPEED_VERTICAL, true);
    if (pressedKeys.size) needsRender = true;
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
      endpointMarkers.forEach((marker, index) => {
        if (!marker.group.visible) return;
        marker.innerRing.rotation.z += ENDPOINT_INNER_RING_SPIN + index * ENDPOINT_RING_SPIN_STAGGER;
        marker.outerRing.rotation.z -= ENDPOINT_OUTER_RING_SPIN + index * ENDPOINT_RING_SPIN_STAGGER;
      });
      nodeHighlightMarkers.forEach(({ marker }, index) => {
        if (!marker.group.visible) return;
        marker.innerRing.rotation.z += HIGHLIGHT_INNER_RING_SPIN + index * HIGHLIGHT_RING_SPIN_STAGGER;
        marker.outerRing.rotation.z -= HIGHLIGHT_OUTER_RING_SPIN + index * HIGHLIGHT_RING_SPIN_STAGGER;
      });
      if (hoverNodeMarker.group.visible) {
        hoverNodeMarker.ball.rotation.y += HOVER_BALL_SPIN;
      }
    }

    if (hoverPending) {
      processHover();
      needsRender = true;
    }

    const pulseTimestamp = performance.now();
    if (hasActivePulse) {
      pulseTime += Math.min(0.05, (pulseTimestamp - lastPulseTimestamp) / 1000);
      pointsMaterial.uniforms.uTime.value = pulseTime;
      edgeVisualMaterial.uniforms.uTime.value = pulseTime;
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

    if (bloomActive) {
      camera.layers.set(BLOOM_LAYER);
      bloomComposer.render();
      camera.layers.set(0);
      finalBloomPass.uniforms!.bloomTexture.value = bloomComposer.renderTarget2.texture;
    } else {
      finalBloomPass.uniforms!.bloomTexture.value = emptyBloomTexture;
    }
    finalComposer.render();
  }

  animate();

  // Every public mutator changes what should be on screen, so wake the on-demand
  // loop after it runs. Camera methods already wake it via emitCameraView, but
  // wrapping uniformly keeps the contract in one place.
  const wake =
    <Args extends unknown[], R>(fn: (...args: Args) => R) =>
    (...args: Args): R => {
      const result = fn(...args);
      needsRender = true;
      return result;
    };

  return {
    focusEdge: wake(focusEdge),
    focusNode: wake(focusNode),
    moveCamera: wake(moveCamera),
    resetCamera: wake(resetCamera),
    updateAccessors: wake(updateAccessors),
    updateActiveGroup: wake(updateActiveGroup),
    updateClusterVisibility: wake(updateClusterVisibilityFromProp),
    updateGalaxyMode: wake(updateGalaxyMode),
    updateMotionPreference: wake(updateMotionPreference),
    updatePlanetSizing: wake(updatePlanetSizing),
    updateSelection: wake(updateSelection),
    updateTheme: wake(updateTheme),
    appendDataset: wake(appendDataset),
    dispose: () => {
      if (sceneDisposed) return;
      sceneDisposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      host.removeEventListener('keydown', handleKeyDown);
      host.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.removeEventListener('change', emitCameraView);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      if (edgeBloomBatch.geometry !== edgeBloomEmptyGeometry) edgeBloomEmptyGeometry.dispose();
      glowTexture.dispose();
      planetTexture.dispose();
      nodeImageTextures.forEach((texture) => texture.dispose());
      nodeImageTextures.clear();
      bloomPass.dispose();
      finalBloomPass.dispose();
      outputPass.dispose();
      bloomComposer.dispose();
      finalComposer.dispose();
      emptyBloomTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelsRoot.remove();
    },
  };
}

function getRendererSceneKey<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  options: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
) {
  return getSceneRebuildKey(options.dataset, getLayoutKey(options.layout));
}

/**
 * Conservatively detect that the only difference between two option sets is appended
 * nodes/edges on top of the unchanged existing prefix (the shape progressive loading
 * and `mergeGraphDataset` produce). Anything else — a replaced entry, removed entry,
 * cluster change, layout change, or a layout that does not preserve positions — returns
 * false so the caller falls back to a full rebuild.
 */
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

  // Clusters are not appended incrementally; any change there forces a rebuild.
  if (prevClusters.length !== nextClusters.length) return false;
  for (let index = 0; index < prevClusters.length; index += 1) {
    if (prevClusters[index] !== nextClusters[index]) return false;
  }

  // Require pure growth: at least one addition, with every existing node/edge kept by
  // reference at its original index (a replaced or reordered entry is not an append).
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

  // Each in-place updater is O(nodes) or O(edges), so only invoke the ones whose
  // input actually changed since the last patch. Object inputs (accessors,
  // planetSizing, theme) are compared by reference; consumers memoize them.
  const applied = state.appliedOptions;
  const next = state.options;

  if (!applied || applied.activeGroup !== next.activeGroup) runtime.updateActiveGroup(next.activeGroup);
  if (!applied || applied.showClusters !== next.showClusters) runtime.updateClusterVisibility(next.showClusters);
  if (!applied || applied.galaxyMode !== next.galaxyMode) runtime.updateGalaxyMode(next.galaxyMode);
  if (!applied || applied.resolvedMotion !== state.resolvedMotion) runtime.updateMotionPreference(state.resolvedMotion);
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
        state.options.planetSizing,
        state.options.theme,
        state.callbacksRef,
        state.pausedRef,
        (nextFailure) => reportRendererFailure(host, state, nextFailure.reason, nextFailure.message, nextFailure.error),
      ),
      releaseContext,
    );
    // createScene already applied every visual option except selection (built as
    // null), so seed the diff baseline accordingly: the first patch then only
    // applies the real selection and any pending camera command.
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

export function createGalaxyRenderer<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLElement,
  options: GalaxyRendererOptions<NMeta, EMeta, CMeta>,
  callbacks: GalaxyRendererCallbacks<NMeta, EMeta> = {},
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
  rebuildRenderer(host, state);

  return {
    focusEdge: (edgeId) => state.runtime?.focusEdge(edgeId),
    focusNode: (nodeId) => state.runtime?.focusNode(nodeId),
    moveCamera: (direction, multiplier) => state.runtime?.moveCamera(direction, multiplier),
    resetCamera: () => state.runtime?.resetCamera(),
    retry: () => {
      rebuildRenderer(host, state);
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
        // Progressive/streamed growth only appends nodes and edges on top of the
        // existing prefix; apply that in place instead of disposing and rebuilding
        // every mesh — a cost that otherwise grows with the total graph on each chunk.
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
        rebuildRenderer(host, state);
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

export {
  defaultEdgeColor,
  defaultEdgeLabel,
  defaultEdgeWeight,
  defaultNodeColor,
  defaultNodeImage,
  defaultNodeLabel,
  defaultNodeRing,
  defaultNodeSize,
  DEFAULT_GRAPH_EDGE_BUDGET,
  formatCompactNumber,
  getEdgeId,
  mergeGraphDataset,
  parseGraphDataset,
  resolveAccessors,
} from '../domain/data';
export type { MergeGraphDatasetOptions, ParsedGraphDataset } from '../domain/data';
export { resolveGraphLayout } from '../domain/layout';
export type {
  GraphLayoutInput,
  GraphLayoutOptions,
  ResolvedGraphLayout,
  ResolvedLayoutCluster,
} from '../domain/layout';
export type { PlanetSizingMode } from './sceneData';
export type {
  EdgeEndpoint,
  GalaxyCameraView,
  GraphAccessors,
  GraphCluster,
  GraphDataset,
  GraphDatasetPatch,
  GraphEdge,
  GraphNode,
  ResolvedAccessors,
  SpaceDirection,
  Vec3,
} from '../domain/types';
