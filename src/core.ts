import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getEdgeId, resolveAccessors } from './data';
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
import { resolveGraphLayout, type GraphLayoutInput } from './layout';
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
} from './types';

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

interface SceneEdgeEndpoint {
  group?: string;
  id: string;
  isNode: boolean;
  label: string;
  position: THREE.Vector3;
  radius: number;
}

interface EdgeEndpoints {
  source: SceneEdgeEndpoint;
  target: SceneEdgeEndpoint;
}

interface EdgeVisualState<EMeta = unknown> {
  edge: GraphEdge<EMeta>;
  endpoints: EdgeEndpoints;
  geometryKey: string;
  hit: THREE.Mesh;
  id: string;
  visual: THREE.Mesh;
}

interface NodeSelectionHighlight {
  connectedEdgeIds: Set<string>;
  firstDegreeNodeIds: Set<string>;
  secondDegreeNodeIds: Set<string>;
}

interface EndpointMarker {
  atmosphere: THREE.Mesh;
  group: THREE.Group;
  core: THREE.Mesh;
  innerRing: THREE.Mesh;
  outerRing: THREE.Mesh;
}

interface HoverNodeMarker {
  ball: THREE.Mesh;
  group: THREE.Group;
}

interface NodeHighlightMarker {
  label: SceneLabel;
  marker: EndpointMarker;
}

interface SceneLabel {
  active: boolean;
  element: HTMLDivElement;
  position: THREE.Vector3;
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
const MAX_STAR_COUNT = 2400;
const QUIET_STAR_COUNT = 1100;
const POINT_PICK_THRESHOLD = 22;
const NODE_HIGHLIGHT_MARKER_LIMIT = 42;
const NODE_HIGHLIGHT_FIRST_DEGREE_LIMIT = 18;
const NODE_HIGHLIGHT_SECOND_DEGREE_LIMIT = 24;
const SELECTED_NODE_RELATIONSHIP_LABEL_LIMIT = 18;
// Factor applied to each RGB channel to dim points hidden by the active group filter.
const DIMMED_POINT_COLOR_FACTOR = 0.36;
// Per-frame camera step for WASD/arrow movement (shift multiplies by KEY_SHIFT_BOOST).
const KEY_MOVE_SPEED = 0.16;
const KEY_MOVE_SPEED_VERTICAL = 0.13;
const KEY_SHIFT_BOOST = 1.75;
// Per-frame world distance moved per WASD step before the speed multiplier above.
const CAMERA_MOVE_DISTANCE = 80;

// ── Renderer, camera & controls ─────────────────────────────────────────────
// Cap devicePixelRatio so retina/4K panels don't quadruple the fragment cost.
const MAX_PIXEL_RATIO = 1.75;
// ACES tone-mapping exposure; >1 lifts the additive glow without clipping highlights.
const TONE_MAPPING_EXPOSURE = 1.1;
// Exponential fog density. Galaxy mode fogs harder so distant arms dissolve into the void.
const FOG_DENSITY_GALAXY = 0.00068;
const FOG_DENSITY_DEFAULT = 0.00042;
// Perspective frustum: wide-ish FOV, tight near plane, far plane past the star shell.
const CAMERA_FOV = 58;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 7000;
// OrbitControls feel: low damping = floaty inertia; speeds tuned <1 to slow the defaults.
const CONTROLS_DAMPING_FACTOR = 0.07;
const CONTROLS_ROTATE_SPEED = 0.42;
const CONTROLS_PAN_SPEED = 0.78;
const CONTROLS_ZOOM_SPEED = 0.72;
const CONTROLS_MIN_DISTANCE = 90;
const CONTROLS_MAX_DISTANCE = 2700;

// ── Lighting (intensity, falloff distance) ──────────────────────────────────
const AMBIENT_LIGHT_INTENSITY = 0.78;
const KEY_LIGHT_INTENSITY = 1.45;
const KEY_LIGHT_DISTANCE = 2400;
const RIM_LIGHT_INTENSITY = 2.2;
const RIM_LIGHT_DISTANCE = 1900;

// ── Planet sizing defaults (overridable via GalaxyPlanetSizingOptions) ───────
const DEFAULT_PLANET_SIZE_MIN = 0.72;
const DEFAULT_PLANET_SIZE_MAX = 2.15;
const DEFAULT_PLANET_SIZE_STRENGTH = 0.82;

// ── Point cloud (every node drawn as an additive sprite) ─────────────────────
// Base point size before per-node size and distance attenuation; galaxy mode runs larger.
const POINT_BASE_SIZE_GALAXY = 2.7;
const POINT_BASE_SIZE_DEFAULT = 2.25;
// Size multiplier applied to a point by selection tier (selected / 1st-degree / 2nd-degree).
const POINT_SIZE_SELECTED = 2.55;
const POINT_SIZE_FIRST_DEGREE = 1.85;
const POINT_SIZE_SECOND_DEGREE = 1.5;
// How strongly a highlighted point is tinted toward the accent/selected color (0..1 lerp).
const POINT_FIRST_DEGREE_TINT = 0.74;
const POINT_SECOND_DEGREE_TINT = 0.6;
// Dimming applied to unrelated points while any node/edge is selected.
const POINT_UNRELATED_DIM = 0.48;
// Whole point-cloud opacity while a selection is active, so the selection stands out.
const SELECTION_POINT_OPACITY = 0.28;
// Point base color treatment: lerp toward the off-white tint, then a slight brighten.
const POINT_COLOR_LERP = 0.12;
const POINT_COLOR_BRIGHTEN = 1.02;
// Over-allocation when growing point buffers on incremental append: *factor then +pad.
const POINT_CAPACITY_GROWTH_FACTOR = 1.5;
const POINT_CAPACITY_GROWTH_PAD = 8;

// ── Background star shell ────────────────────────────────────────────────────
const STAR_DISTANCE_MIN = 1600;
const STAR_DISTANCE_SPAN = 2100;
const STAR_VERTICAL_SPREAD = 900;
const STAR_SIZE = 1.25;
const STAR_OPACITY = 0.2;

// ── Cluster / planet / ring / image materials ────────────────────────────────
const GLOW_SPRITE_OPACITY = 0.055;
// Cluster label floats this fraction of the cluster radius above its center.
const CLUSTER_LABEL_HEIGHT_FACTOR = 0.85;
// Cluster glow sprite scale relative to its radius (galaxy mode blooms larger).
const CLUSTER_SPRITE_SCALE_GALAXY = 1.18;
const CLUSTER_SPRITE_SCALE_DEFAULT = 0.92;
const PLANET_MATERIAL_OPACITY = 0.34;
const RING_MATERIAL_OPACITY = 0.12;
const NODE_IMAGE_SPRITE_OPACITY = 0.94;
const NODE_IMAGE_MAX_ANISOTROPY = 4;
// Planet sphere radius per node = nodeSize * this, before the sizing multiplier.
const PLANET_RADIUS_FACTOR = 0.68;
// Node image sprite scale = planetScale * this (floored so tiny planets stay legible).
const NODE_IMAGE_SCALE_FACTOR = 1.82;
const NODE_IMAGE_MIN_SCALE = 0.4;

// ── Node color helpers ───────────────────────────────────────────────────────
// dimColor: lerp toward the pale tint, then multiply down; default multiplier reused
// as the planet dim factor while a selection is active.
const DIM_COLOR_LERP = 0.42;
const DIM_COLOR_MULTIPLIER = 0.86;
// planetColor: whiten the node color by this much for the lit planet body.
const PLANET_COLOR_WHITEN = 0.45;

// ── Selection / hover emphasis on major-node planets ─────────────────────────
// Planet scale bump by emphasis tier (selected > related/1st > 2nd > hovered > idle=1).
const PLANET_SCALE_SELECTED = 1.38;
const PLANET_SCALE_RELATED = 1.2;
const PLANET_SCALE_SECOND_DEGREE = 1.14;
const PLANET_SCALE_HOVERED = 1.1;
// Ring scale = radius * RING_SCALE_BASE * (per-tier factor below).
const RING_SCALE_BASE = 1.42;
const RING_SCALE_SELECTED = 1.42;
const RING_SCALE_RELATED = 1.24;
const RING_SCALE_SECOND_DEGREE = 1.14;
const RING_SCALE_HOVERED = 1.08;
const RING_SCALE_IDLE = 0.92;
// Hovered (but unselected) planets brighten their base color by this factor.
const PLANET_HOVER_BRIGHTEN = 1.18;
// Planets get a deterministic per-instance yaw (index % cycle * step) so they don't
// all present the same face; rings reuse the cycle plus a fixed tilt to read as 3D.
const PLANET_YAW_CYCLE = 16;
const PLANET_YAW_STEP = 0.12;
const RING_TILT_X = Math.PI * 0.55;
const RING_TILT_Y = Math.PI * 0.1;
// Major-node label height = max(nodeSize * factor, radius * factor) above the node.
const MAJOR_LABEL_NODE_SIZE_FACTOR = 1.85;
const MAJOR_LABEL_RADIUS_FACTOR = 1.18;

// ── Label thinning (which major/cluster labels stay visible to avoid clutter) ─
const MAJOR_LABEL_LIMIT_GROUPED = 12;
const MAJOR_LABEL_LIMIT_TOP = 6;
const MAJOR_LABEL_INTERVAL = 11;
const CLUSTER_LABEL_LIMIT_GROUPED = 4;
const CLUSTER_LABEL_INDEX_A = 3;
const CLUSTER_LABEL_INDEX_B = 9;

// ── Endpoint & highlight markers ─────────────────────────────────────────────
// Marker layer opacity = base + strength(0..1) * span, per concentric layer.
const MARKER_ATMOSPHERE_OPACITY_BASE = 0.06;
const MARKER_ATMOSPHERE_OPACITY_SPAN = 0.16;
const MARKER_CORE_OPACITY_BASE = 0.24;
const MARKER_CORE_OPACITY_SPAN = 0.46;
const MARKER_INNER_RING_OPACITY_BASE = 0.08;
const MARKER_INNER_RING_OPACITY_SPAN = 0.22;
const MARKER_OUTER_RING_OPACITY_BASE = 0.04;
const MARKER_OUTER_RING_OPACITY_SPAN = 0.13;
// Marker layer scale relative to the (clamped) endpoint radius.
const MARKER_MIN_SCALE = 24;
const MARKER_ATMOSPHERE_SCALE = 0.54;
const MARKER_CORE_SCALE = 0.3;
const MARKER_INNER_RING_SCALE = 0.94;
const MARKER_OUTER_RING_SCALE = 1.18;
// Hover ball: opacity, radius factor, and clamp range for its scale.
const HOVER_BALL_OPACITY = 0.74;
const HOVER_BALL_RADIUS_FACTOR = 0.46;
const HOVER_BALL_MIN_SCALE = 8;
const HOVER_BALL_MAX_SCALE = 18;
const HOVER_BALL_SPIN = 0.004;
// Highlight-marker scale/strength for 1st-degree (level 2) vs 2nd-degree (level 1) nodes.
const HIGHLIGHT_MARKER_SCALE_NEAR = 0.86;
const HIGHLIGHT_MARKER_SCALE_FAR = 0.78;
const HIGHLIGHT_MARKER_STRENGTH_NEAR = 0.72;
const HIGHLIGHT_MARKER_STRENGTH_FAR = 0.54;
// Endpoint marker scale when the endpoint is the selected node vs. just an edge end.
const ENDPOINT_MARKER_SCALE_PRIMARY = 1.34;
const ENDPOINT_MARKER_SCALE_SECONDARY = 1.12;
// Node-marker label offset as fractions of the node radius (x to the side, y above),
// each floored to a minimum pixel offset so labels never overlap tiny nodes.
const NODE_MARKER_LABEL_OFFSET_X = 0.68;
const NODE_MARKER_LABEL_OFFSET_Y = 0.34;
const NODE_MARKER_LABEL_MIN_X = 18;
const NODE_MARKER_LABEL_MIN_Y = 8;
// Marker ring spin per frame in animated mode (base + per-marker-index stagger).
const ENDPOINT_INNER_RING_SPIN = 0.006;
const ENDPOINT_OUTER_RING_SPIN = 0.004;
const ENDPOINT_RING_SPIN_STAGGER = 0.001;
const HIGHLIGHT_INNER_RING_SPIN = 0.004;
const HIGHLIGHT_OUTER_RING_SPIN = 0.0025;
const HIGHLIGHT_RING_SPIN_STAGGER = 0.0002;

// ── Endpoint resolution (interaction hit radius of nodes & clusters) ──────────
const ENDPOINT_MIN_RADIUS = 14;
const ENDPOINT_PLANET_RADIUS_FACTOR = 1.35;
const ENDPOINT_NODE_SIZE_FACTOR_MAJOR = 1.4;
const ENDPOINT_NODE_SIZE_FACTOR_MINOR = 2.2;
const CLUSTER_ENDPOINT_MIN_RADIUS = 28;
const CLUSTER_ENDPOINT_RADIUS_FACTOR = 0.42;

// ── Edge geometry & appearance ───────────────────────────────────────────────
// Curve lift (how far the bezier control point bows up) and per-distance extra lift.
const EDGE_CURVE_DEFAULT_LIFT = 50;
const EDGE_CURVE_DISTANCE_LIFT = 0.04;
const EDGE_MIDPOINT_LERP = 0.5;
// Filament edges (cluster-to-cluster gossamer) vs. weighted relationship edges.
const EDGE_FILAMENT_LIFT_GALAXY = 86;
const EDGE_FILAMENT_LIFT_DEFAULT = 38;
const EDGE_LIFT_BASE = 24;
const EDGE_LIFT_PER_WEIGHT = 42;
const EDGE_FILAMENT_RADIUS = 0.3;
const EDGE_RADIUS_BASE = 0.34;
const EDGE_RADIUS_PER_WEIGHT = 0.34;
const EDGE_FILAMENT_OPACITY_GALAXY = 0.078;
const EDGE_FILAMENT_OPACITY_DEFAULT = 0.052;
const EDGE_OPACITY_BASE = 0.075;
const EDGE_OPACITY_PER_WEIGHT = 0.1;
const EDGE_FILAMENT_VISUAL_SEGMENTS = 36;
const EDGE_VISUAL_SEGMENTS = 28;
const EDGE_FILAMENT_HIT_SEGMENTS = 16;
const EDGE_HIT_SEGMENTS = 18;
const EDGE_FILAMENT_HIT_RADIUS = 10;
const EDGE_HIT_RADIUS = 8;
// Edge opacity ramp by state: each tier is min(cap, baseOpacity + boost).
const EDGE_DEFAULT_BASE_OPACITY = 0.18;
const EDGE_OPACITY_SELECTED_CAP = 0.86;
const EDGE_OPACITY_SELECTED_BOOST = 0.56;
const EDGE_OPACITY_HOVER_CAP = 0.54;
const EDGE_OPACITY_HOVER_BOOST = 0.26;
const EDGE_OPACITY_CONNECTED_CAP = 0.82;
const EDGE_OPACITY_CONNECTED_BOOST = 0.52;
const EDGE_OPACITY_UNRELATED_DIM = 0.28;
// Hover-edge overlay: its own opacity and how much fatter than the base tube it draws.
const HOVER_EDGE_OVERLAY_OPACITY = 0.34;
const HOVER_EDGE_RADIUS_FACTOR = 1.85;

// ── Focus camera framing ─────────────────────────────────────────────────────
// focusNode offset = (nodeSize * scale + base) per axis, pulling the camera back & up.
const FOCUS_NODE_OFFSET_X_SCALE = 6;
const FOCUS_NODE_OFFSET_X_BASE = 60;
const FOCUS_NODE_OFFSET_Y_SCALE = 5;
const FOCUS_NODE_OFFSET_Y_BASE = 44;
const FOCUS_NODE_OFFSET_Z_SCALE = 9;
const FOCUS_NODE_OFFSET_Z_BASE = 150;
// focusEdge frames the midpoint; offset = (edgeLength * scale + base) per axis.
const FOCUS_EDGE_MIN_DISTANCE = 160;
const FOCUS_EDGE_OFFSET_XY_SCALE = 0.14;
const FOCUS_EDGE_OFFSET_X_BASE = 90;
const FOCUS_EDGE_OFFSET_Y_BASE = 82;
const FOCUS_EDGE_OFFSET_Z_SCALE = 0.52;
const FOCUS_EDGE_OFFSET_Z_BASE = 320;
// Hover label floats this fraction of the node radius above it (min 12 world units).
const HOVER_LABEL_MIN_HEIGHT = 12;
const HOVER_LABEL_HEIGHT_FACTOR = 0.72;

// ── Ambient animation ────────────────────────────────────────────────────────
// World auto-rotation per frame in full-motion galaxy mode (radians).
const WORLD_ROTATION_SPEED = 0.000035;
const tmpVector = new THREE.Vector3();
const tmpProjected = new THREE.Vector3();
const tmpDirection = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMove = new THREE.Vector3();
const tmpPointCloudColor = new THREE.Color();
const tmpPointSelectionColor = new THREE.Color();
const tmpPointSelectionTargetColor = new THREE.Color();
const pointCloudLerpColor = new THREE.Color(0xf4f7f2);
const instanceDummy = new THREE.Object3D();

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

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.24, 'rgba(120,255,220,0.78)');
  gradient.addColorStop(0.62, 'rgba(80,210,255,0.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makePlanetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(92, 78, 14, 128, 128, 136);
  gradient.addColorStop(0, '#fbfff8');
  gradient.addColorStop(0.4, '#eef6f1');
  gradient.addColorStop(0.78, '#d5e0dc');
  gradient.addColorStop(1, '#b6c5c0');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  for (let band = 0; band < 8; band += 1) {
    context.fillStyle = band % 2 === 0 ? '#f8fbf7' : '#5e6d68';
    context.globalAlpha = band % 2 === 0 ? 0.2 : 0.06;
    context.beginPath();
    context.ellipse(128, 34 + band * 24, 124, 5 + (band % 4) * 4, band * 0.07, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 0.28;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(92, 82, 34, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 0.015;
  context.fillStyle = '#000000';
  context.beginPath();
  context.arc(172, 170, 78, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function dimColor(color: string, multiplier = DIM_COLOR_MULTIPLIER) {
  return new THREE.Color(color).lerp(new THREE.Color(0xe6f2ee), DIM_COLOR_LERP).multiplyScalar(multiplier);
}

function planetColor(color: string) {
  return new THREE.Color(color).lerp(new THREE.Color(0xffffff), PLANET_COLOR_WHITEN);
}

function pointCloudColor(color: string) {
  return tmpPointCloudColor.set(color).lerp(pointCloudLerpColor, POINT_COLOR_LERP).multiplyScalar(POINT_COLOR_BRIGHTEN);
}

function curvedEdgeCurve(a: THREE.Vector3, b: THREE.Vector3, lift = EDGE_CURVE_DEFAULT_LIFT) {
  const midpoint = a.clone().lerp(b, EDGE_MIDPOINT_LERP);
  midpoint.y += lift + a.distanceTo(b) * EDGE_CURVE_DISTANCE_LIFT;
  return new THREE.QuadraticBezierCurve3(a, midpoint, b);
}

function makeLabel(text: string, className: string) {
  const label = document.createElement('div');
  label.className = className;
  label.textContent = text;
  return label;
}

function setLabelPosition(
  label: HTMLDivElement,
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  tmpProjected.copy(position).project(camera);
  const visible = tmpProjected.z < 1;
  label.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  label.style.transform = `translate3d(${(tmpProjected.x * 0.5 + 0.5) * width}px, ${(-tmpProjected.y * 0.5 + 0.5) * height}px, 0)`;
}

function makeSceneLabel(root: HTMLDivElement, className: string): SceneLabel {
  const element = makeLabel('', className);
  element.style.display = 'none';
  root.appendChild(element);
  return { active: false, element, position: new THREE.Vector3() };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstStringValue(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function formatRelationshipLabel(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function edgeDisplayLabel<EMeta>(edge: GraphEdge<EMeta>, accessors: ResolvedAccessors<unknown, EMeta>) {
  const accessorLabel = accessors.edgeLabel(edge);
  if (accessorLabel?.trim()) return formatRelationshipLabel(accessorLabel);

  const edgeRecord = edge as GraphEdge<EMeta> & Record<string, unknown>;
  const metaRecord = isPlainRecord(edge.meta) ? edge.meta : null;
  const label =
    firstStringValue(edgeRecord, ['label', 'name', 'type', 'kind']) ??
    firstStringValue(metaRecord, ['label', 'name', 'type', 'kind']) ??
    'relationship';

  return formatRelationshipLabel(label);
}

function selectedEdgeDisplayLabel<EMeta>(
  edge: GraphEdge<EMeta>,
  endpoints: EdgeEndpoints,
  accessors: ResolvedAccessors<unknown, EMeta>,
) {
  const relationship = edgeDisplayLabel(edge, accessors);
  const source = endpoints.source.label;
  const target = endpoints.target.label;
  if (!source && !target) return relationship;
  if (!target) return `${source} -> ${relationship}`;
  if (!source) return `${relationship} -> ${target}`;
  return `${source} -> ${relationship} -> ${target}`;
}

function nodeDisplayLabel<NMeta, EMeta>(node: GraphNode<NMeta>, accessors: ResolvedAccessors<NMeta, EMeta>) {
  const accessorLabel = accessors.nodeLabel(node)?.trim();
  const nodeLabel = node.label?.trim() || node.name?.trim() || node.type?.trim();
  return accessorLabel || nodeLabel || node.id;
}

function setSceneLabel(label: SceneLabel, text: string | null, position: THREE.Vector3 | null) {
  label.active = Boolean(text && position);
  if (!label.active || !text || !position) {
    label.element.style.display = 'none';
    label.element.textContent = '';
    return;
  }

  label.element.textContent = text;
  label.position.copy(position);
}

function shouldShowMajorLabel(index: number, activeGroup: string | null) {
  if (activeGroup !== null) return index < MAJOR_LABEL_LIMIT_GROUPED;
  return index < MAJOR_LABEL_LIMIT_TOP || index % MAJOR_LABEL_INTERVAL === 0;
}

function shouldShowClusterLabel(index: number, activeGroup: string | null) {
  if (activeGroup !== null) return index < CLUSTER_LABEL_LIMIT_GROUPED;
  return index === CLUSTER_LABEL_INDEX_A || index === CLUSTER_LABEL_INDEX_B;
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

function createEndpointMarker(color: string) {
  const group = new THREE.Group();
  group.visible = false;

  const atmosphereGeometry = new THREE.SphereGeometry(1, 32, 18);
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  atmosphere.renderOrder = 30;
  group.add(atmosphere);

  const coreGeometry = new THREE.SphereGeometry(1, 24, 16);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.renderOrder = 31;
  group.add(core);

  const ringGeometry = new THREE.RingGeometry(1.18, 1.28, 96);
  const innerRingMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const innerRing = new THREE.Mesh(ringGeometry, innerRingMaterial);
  innerRing.renderOrder = 32;
  innerRing.rotation.set(Math.PI * 0.54, Math.PI * 0.08, 0);
  group.add(innerRing);

  const outerRingMaterial = innerRingMaterial.clone();
  outerRingMaterial.opacity = 0.12;
  const outerRing = new THREE.Mesh(ringGeometry, outerRingMaterial);
  outerRing.renderOrder = 32;
  outerRing.rotation.set(Math.PI * 0.5, Math.PI * 0.32, Math.PI * 0.33);
  group.add(outerRing);

  return { atmosphere, group, core, innerRing, outerRing };
}

function setMarkerColor(marker: EndpointMarker, color: string) {
  (marker.atmosphere.material as THREE.MeshBasicMaterial).color.set(color);
  (marker.core.material as THREE.MeshBasicMaterial).color.set(color);
  (marker.innerRing.material as THREE.MeshBasicMaterial).color.set(color);
  (marker.outerRing.material as THREE.MeshBasicMaterial).color.set(color);
}

function setMarkerStrength(marker: EndpointMarker, strength: number) {
  const clamped = Math.max(0, Math.min(1, strength));
  (marker.atmosphere.material as THREE.MeshBasicMaterial).opacity =
    MARKER_ATMOSPHERE_OPACITY_BASE + clamped * MARKER_ATMOSPHERE_OPACITY_SPAN;
  (marker.core.material as THREE.MeshBasicMaterial).opacity = MARKER_CORE_OPACITY_BASE + clamped * MARKER_CORE_OPACITY_SPAN;
  (marker.innerRing.material as THREE.MeshBasicMaterial).opacity =
    MARKER_INNER_RING_OPACITY_BASE + clamped * MARKER_INNER_RING_OPACITY_SPAN;
  (marker.outerRing.material as THREE.MeshBasicMaterial).opacity =
    MARKER_OUTER_RING_OPACITY_BASE + clamped * MARKER_OUTER_RING_OPACITY_SPAN;
}

function setMarkerVisible(
  marker: EndpointMarker,
  endpoint: SceneEdgeEndpoint | null,
  color: string,
  scaleMultiplier: number,
  strength = 1,
) {
  marker.group.visible = Boolean(endpoint);
  if (!endpoint) return;

  setMarkerColor(marker, color);
  setMarkerStrength(marker, strength);
  const scale = Math.max(MARKER_MIN_SCALE, endpoint.radius * scaleMultiplier);
  marker.group.position.copy(endpoint.position);
  marker.atmosphere.scale.setScalar(scale * MARKER_ATMOSPHERE_SCALE);
  marker.core.scale.setScalar(scale * MARKER_CORE_SCALE);
  marker.innerRing.scale.setScalar(scale * MARKER_INNER_RING_SCALE);
  marker.outerRing.scale.setScalar(scale * MARKER_OUTER_RING_SCALE);
}

function createHoverNodeMarker(color: string): HoverNodeMarker {
  const group = new THREE.Group();
  group.visible = false;

  const ballMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: HOVER_BALL_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), ballMaterial);
  ball.renderOrder = 35;
  group.add(ball);

  return { ball, group };
}

function setHoverNodeMarkerVisible(marker: HoverNodeMarker, endpoint: SceneEdgeEndpoint | null, color: string) {
  marker.group.visible = Boolean(endpoint);
  if (!endpoint) return;

  (marker.ball.material as THREE.MeshBasicMaterial).color.set(color);
  marker.group.position.copy(endpoint.position);
  marker.ball.scale.setScalar(
    Math.max(HOVER_BALL_MIN_SCALE, Math.min(HOVER_BALL_MAX_SCALE, endpoint.radius * HOVER_BALL_RADIUS_FACTOR)),
  );
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

function getEdgeSpec<EMeta>(
  edge: GraphEdge<EMeta>,
  endpoints: EdgeEndpoints,
  accessors: ResolvedAccessors<unknown, EMeta>,
  galaxyMode: boolean,
) {
  const isFilament = edge.kind === 'filament';
  const weight = accessors.edgeWeight(edge);
  const lift = isFilament
    ? galaxyMode
      ? EDGE_FILAMENT_LIFT_GALAXY
      : EDGE_FILAMENT_LIFT_DEFAULT
    : EDGE_LIFT_BASE + weight * EDGE_LIFT_PER_WEIGHT;
  const radius = isFilament ? EDGE_FILAMENT_RADIUS : EDGE_RADIUS_BASE + weight * EDGE_RADIUS_PER_WEIGHT;
  const opacity = isFilament
    ? galaxyMode
      ? EDGE_FILAMENT_OPACITY_GALAXY
      : EDGE_FILAMENT_OPACITY_DEFAULT
    : EDGE_OPACITY_BASE + weight * EDGE_OPACITY_PER_WEIGHT;
  const curve = curvedEdgeCurve(endpoints.source.position, endpoints.target.position, lift);
  const visualSegments = isFilament ? EDGE_FILAMENT_VISUAL_SEGMENTS : EDGE_VISUAL_SEGMENTS;
  const hitSegments = isFilament ? EDGE_FILAMENT_HIT_SEGMENTS : EDGE_HIT_SEGMENTS;
  const hitRadius = isFilament ? EDGE_FILAMENT_HIT_RADIUS : EDGE_HIT_RADIUS;

  return {
    color: accessors.edgeColor(edge),
    curve,
    geometryKey: `${lift.toFixed(4)}:${radius.toFixed(4)}:${visualSegments}:${hitSegments}`,
    hitRadius,
    hitSegments,
    opacity,
    radius,
    visualSegments,
  };
}

function createTubeGeometry(curve: THREE.Curve<THREE.Vector3>, segments: number, radius: number) {
  return new THREE.TubeGeometry(curve, segments, radius, 6, false);
}

function selectedEdgeLabelPosition<EMeta>(
  state: EdgeVisualState<EMeta>,
  accessors: ResolvedAccessors<unknown, EMeta>,
  galaxyMode: boolean,
) {
  return getEdgeSpec(state.edge, state.endpoints, accessors, galaxyMode).curve.getPoint(0.5);
}

function createScene<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLDivElement,
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  initialActiveGroup: string | null,
  initialShowClusters: boolean,
  initialGalaxyMode: boolean,
  initialMotion: ResolvedGalaxyMotion,
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090b11, galaxyMode ? FOG_DENSITY_GALAXY : FOG_DENSITY_DEFAULT);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.copy(CAMERA_HOME);

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
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      varying float vSharpness;
      uniform float pixelRatio;
      uniform float baseSize;
      void main() {
        vColor = color;
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
      uniform float globalOpacity;
      void main() {
        vec2 uv = gl_PointCoord.xy - vec2(0.5);
        float dist = length(uv);
        float edge = mix(0.08, 0.18, vSharpness);
        float coreWidth = mix(0.16, 0.24, vSharpness);
        float alpha = smoothstep(0.5, edge, dist);
        float core = smoothstep(coreWidth, 0.0, dist);
        float opacity = mix(0.32, 0.52, vSharpness);
        gl_FragColor = vec4(vColor * (1.0 + core * 0.72), alpha * opacity * globalOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const pointCloud = new THREE.Points(pointsGeometry, pointsMaterial);
  pointCloud.userData.type = 'node-points';
  world.add(pointCloud);

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
    label.position.set(cluster.center.x, cluster.center.y + cluster.radius * CLUSTER_LABEL_HEIGHT_FACTOR, cluster.center.z);

    return {
      group: cluster.group,
      label,
      labelText: cluster.label,
      labelIndex: index,
      radius: cluster.radius,
      sprite,
    };
  });

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
      if (!state || !state.visual.visible) {
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
      state.visual.visible = false;
      state.hit.userData.pickable = false;
      edgeEndpoints.delete(state.id);
      return;
    }

    state.endpoints = { source, target };
    edgeEndpoints.set(state.id, state.endpoints);
    const spec = getEdgeSpec(state.edge, state.endpoints, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode);
    if (state.geometryKey !== spec.geometryKey) {
      state.visual.geometry.dispose();
      state.visual.geometry = createTubeGeometry(spec.curve, spec.visualSegments, spec.radius);
      state.hit.geometry.dispose();
      state.hit.geometry = createTubeGeometry(spec.curve, spec.hitSegments, spec.hitRadius);
      state.geometryKey = spec.geometryKey;
    }

    const visualMaterial = state.visual.material as THREE.MeshBasicMaterial;
    visualMaterial.color.set(spec.color);
    state.visual.userData.baseOpacity = spec.opacity;
    const hitMaterial = state.hit.material as THREE.MeshBasicMaterial;
    hitMaterial.color.set(spec.color);
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
      state.visual.visible = visible;
      state.hit.userData.pickable = visible;
    });
  }

  function updateEdges() {
    edgeStates.forEach((state) => refreshEdgeGeometry(state));
    updateEdgeVisibility();
  }

  function addEdgeMesh(edge: GraphEdge<EMeta>, index: number) {
    const source = resolveEndpoint(edge.source, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius);
    const target = resolveEndpoint(edge.target, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius);
    if (!source || !target) return;

    const edgeId = getEdgeId(edge, index);
    const endpoints = { source, target };
    const spec = getEdgeSpec(edge, endpoints, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode);
    const visual = new THREE.Mesh(
      createTubeGeometry(spec.curve, spec.visualSegments, spec.radius),
      new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    visual.userData.edgeId = edgeId;
    visual.userData.baseOpacity = spec.opacity;
    world.add(visual);

    const hit = new THREE.Mesh(
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

    const state = { edge, endpoints, geometryKey: spec.geometryKey, hit, id: edgeId, visual };
    edgeStates.set(edgeId, state);
    edgeLookup.set(edgeId, edge);
    edgeEndpoints.set(edgeId, endpoints);
    indexSelectableEdge(edgeId, edge);
  }

  dataset.edges.forEach(addEdgeMesh);

  // Grow (and lazily reallocate) the point-cloud buffers to cover `nextCount` nodes,
  // seeding positions for the appended tail. Used by the incremental append path so a
  // streamed chunk never rebuilds the whole point cloud.
  function growPointBuffers(prevCount: number, nextCount: number) {
    if (nextCount > pointCapacity) {
      const nextCapacity = Math.max(nextCount, Math.ceil(pointCapacity * POINT_CAPACITY_GROWTH_FACTOR) + POINT_CAPACITY_GROWTH_PAD);
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

    updatePointAppearance();
    updateEdges();
    updateClusterVisibility();
    updateSelection(selectedNodeId, selectedEdgeId);
    updateHoverHighlight();
    needsRender = true;
  }

  const hoverEdgeEmptyGeometry = new THREE.BufferGeometry();
  const hoverEdgeMaterial = new THREE.MeshBasicMaterial({
    color: theme?.panelAccentColor ?? '#46f4bc',
    transparent: true,
    opacity: HOVER_EDGE_OVERLAY_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const hoverEdgeOverlay = new THREE.Mesh(hoverEdgeEmptyGeometry, hoverEdgeMaterial);
  hoverEdgeOverlay.renderOrder = 19;
  hoverEdgeOverlay.visible = false;
  world.add(hoverEdgeOverlay);
  let hoverEdgeOverlayGeometry: THREE.BufferGeometry | null = null;
  let hoverEdgeOverlayKey: string | null = null;

  function updateHoverEdgeOverlay() {
    const state = hoveredEdgeId ? (edgeStates.get(hoveredEdgeId) ?? null) : null;
    hoverEdgeMaterial.color.set(theme?.panelAccentColor ?? '#46f4bc');

    if (!state || !state.visual.visible) {
      hoverEdgeOverlay.visible = false;
      return;
    }

    const spec = getEdgeSpec(state.edge, state.endpoints, accessors as ResolvedAccessors<unknown, EMeta>, galaxyMode);
    const nextKey = `${state.id}:${spec.geometryKey}`;
    if (hoverEdgeOverlayKey !== nextKey) {
      hoverEdgeOverlayGeometry?.dispose();
      hoverEdgeOverlayGeometry = createTubeGeometry(spec.curve, spec.visualSegments, spec.radius * HOVER_EDGE_RADIUS_FACTOR);
      hoverEdgeOverlay.geometry = hoverEdgeOverlayGeometry;
      hoverEdgeOverlayKey = nextKey;
    }

    hoverEdgeOverlay.visible = true;
  }

  function applyEdgeAppearance() {
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    edgeStates.forEach((state) => {
      const material = state.visual.material as THREE.MeshBasicMaterial;
      const baseOpacity = Number(state.visual.userData.baseOpacity ?? EDGE_DEFAULT_BASE_OPACITY);
      const selected = selectedEdgeId === state.id;
      const connectedToSelectedNode = Boolean(selectedNodeHighlight?.connectedEdgeIds.has(state.id));
      const hovered = hoveredEdgeId === state.id;
      if (material.wireframe) {
        material.wireframe = false;
        material.needsUpdate = true;
      }
      material.opacity = selected
        ? Math.min(EDGE_OPACITY_SELECTED_CAP, baseOpacity + EDGE_OPACITY_SELECTED_BOOST)
        : hovered
          ? Math.min(EDGE_OPACITY_HOVER_CAP, baseOpacity + EDGE_OPACITY_HOVER_BOOST)
          : connectedToSelectedNode
            ? Math.min(EDGE_OPACITY_CONNECTED_CAP, baseOpacity + EDGE_OPACITY_CONNECTED_BOOST)
            : hasSelection
              ? baseOpacity * EDGE_OPACITY_UNRELATED_DIM
              : baseOpacity;
      material.depthTest = !(selected || connectedToSelectedNode || hovered);
      material.color.set(
        selected
          ? '#ffffff'
          : hovered
            ? (theme?.panelAccentColor ?? '#46f4bc')
            : connectedToSelectedNode
              ? (theme?.panelAccentColor ?? '#46f4bc')
              : accessors.edgeColor(state.edge),
      );
      state.visual.renderOrder = selected ? 18 : hovered ? 17 : connectedToSelectedNode ? 16 : 0;
      state.visual.scale.setScalar(1);
    });
  }

  function updateHoverHighlight() {
    const hoveredEndpoint = hoveredNodeId
      ? resolveEndpoint(hoveredNodeId, nodeLookup, nodePositions, clusterLookup, accessors, planetRadius)
      : null;
    setHoverNodeMarkerVisible(hoverNodeMarker, hoveredEndpoint, theme?.panelAccentColor ?? '#46f4bc');
    updateMajorOverlay();
    updateHoverEdgeOverlay();
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
    setMarkerVisible(
      endpointMarkers[1],
      secondaryEndpoint,
      theme?.panelAccentColor ?? '#46f4bc',
      selectedEndpoints?.target.id === selectedNodeId ? ENDPOINT_MARKER_SCALE_PRIMARY : ENDPOINT_MARKER_SCALE_SECONDARY,
    );
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
    camera.position.copy(target).add(
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
    camera.position.copy(midpoint).add(
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

    renderer.render(scene, camera);
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
      if (hoverEdgeOverlay.geometry !== hoverEdgeEmptyGeometry) hoverEdgeEmptyGeometry.dispose();
      glowTexture.dispose();
      planetTexture.dispose();
      nodeImageTextures.forEach((texture) => texture.dispose());
      nodeImageTextures.clear();
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
} from './data';
export type { MergeGraphDatasetOptions, ParsedGraphDataset } from './data';
export { resolveGraphLayout } from './layout';
export type { GraphLayoutInput, GraphLayoutOptions, ResolvedGraphLayout, ResolvedLayoutCluster } from './layout';
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
} from './types';
