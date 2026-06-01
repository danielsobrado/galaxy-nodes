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
  dispose: () => void;
}

function withContextReservation<NMeta, EMeta>(runtime: SceneRuntime<NMeta, EMeta>, release: () => void) {
  let released = false;
  return {
    ...runtime,
    dispose: () => {
      try {
        runtime.dispose();
      } finally {
        if (!released) {
          released = true;
          release();
        }
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
  min: 0.72,
  max: 2.15,
  strength: 0.82,
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

function dimColor(color: string, multiplier = 0.86) {
  return new THREE.Color(color).lerp(new THREE.Color(0xe6f2ee), 0.42).multiplyScalar(multiplier);
}

function planetColor(color: string) {
  return new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45);
}

function pointCloudColor(color: string) {
  return tmpPointCloudColor.set(color).lerp(pointCloudLerpColor, 0.12).multiplyScalar(1.02);
}

function curvedEdgeCurve(a: THREE.Vector3, b: THREE.Vector3, lift = 50) {
  const midpoint = a.clone().lerp(b, 0.5);
  midpoint.y += lift + a.distanceTo(b) * 0.04;
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
  if (activeGroup !== null) return index < 12;
  return index < 6 || index % 11 === 0;
}

function shouldShowClusterLabel(index: number, activeGroup: string | null) {
  if (activeGroup !== null) return index < 4;
  return index === 3 || index === 9;
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
    const radius = Math.max(14, planetRadius(node) * 1.35, accessors.nodeSize(node) * (node.major ? 1.4 : 2.2));
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
  (marker.atmosphere.material as THREE.MeshBasicMaterial).opacity = 0.06 + clamped * 0.16;
  (marker.core.material as THREE.MeshBasicMaterial).opacity = 0.24 + clamped * 0.46;
  (marker.innerRing.material as THREE.MeshBasicMaterial).opacity = 0.08 + clamped * 0.22;
  (marker.outerRing.material as THREE.MeshBasicMaterial).opacity = 0.04 + clamped * 0.13;
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
  const scale = Math.max(24, endpoint.radius * scaleMultiplier);
  marker.group.position.copy(endpoint.position);
  marker.atmosphere.scale.setScalar(scale * 0.54);
  marker.core.scale.setScalar(scale * 0.3);
  marker.innerRing.scale.setScalar(scale * 0.94);
  marker.outerRing.scale.setScalar(scale * 1.18);
}

function createHoverNodeMarker(color: string): HoverNodeMarker {
  const group = new THREE.Group();
  group.visible = false;

  const ballMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.74,
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
  marker.ball.scale.setScalar(Math.max(8, Math.min(18, endpoint.radius * 0.46)));
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
  const lift = isFilament ? (galaxyMode ? 86 : 38) : 24 + weight * 42;
  const radius = isFilament ? 0.3 : 0.34 + weight * 0.34;
  const opacity = isFilament ? (galaxyMode ? 0.078 : 0.052) : 0.075 + weight * 0.1;
  const curve = curvedEdgeCurve(endpoints.source.position, endpoints.target.position, lift);
  const visualSegments = isFilament ? 36 : 28;
  const hitSegments = isFilament ? 16 : 18;
  const hitRadius = isFilament ? 10 : 8;

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
  const graphLayout = resolveGraphLayout(dataset, layoutInput);
  const nodeIndex: SceneNodeIndex<NMeta> = buildSceneNodeIndex(dataset.nodes);
  const nodeDegrees = buildNodeDegrees(dataset);

  const labelsRoot = document.createElement('div');
  labelsRoot.className = 'scene-labels';
  host.appendChild(labelsRoot);

  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(width, height);
  renderer.setClearColor(theme?.background ?? '#07090d', 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090b11, galaxyMode ? 0.00068 : 0.00042);

  const camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 7000);
  camera.position.copy(CAMERA_HOME);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.42;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.panSpeed = 0.78;
  controls.zoomSpeed = 0.72;
  controls.minDistance = 90;
  controls.maxDistance = 2700;
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
    callbacksRef.current.onCameraViewChange?.(currentCameraView());
  }

  controls.addEventListener('change', emitCameraView);

  scene.add(new THREE.AmbientLight(0x96ffe2, 0.78));
  const keyLight = new THREE.PointLight(0xffffff, 1.45, 2400);
  keyLight.position.set(-260, 520, 680);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x54ffe0, 2.2, 1900);
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
        radius: Math.max(28, cluster.radius * 0.42),
      },
    ]),
  );
  const edgeLookup = new Map<string, GraphEdge<EMeta>>();
  const edgeEndpoints = new Map<string, EdgeEndpoints>();
  const edgeStates = new Map<string, EdgeVisualState<EMeta>>();
  const incidentEdgeIdsByNodeId = new Map<string, Set<string>>();
  const neighborNodeIdsByNodeId = new Map<string, Set<string>>();
  const interactiveEdgeMeshes: THREE.Object3D[] = [];

  const pointPositions = new Float32Array(dataset.nodes.length * 3);
  const basePointColors = new Float32Array(dataset.nodes.length * 3);
  const pointColors = new Float32Array(dataset.nodes.length * 3);
  const basePointSizes = new Float32Array(dataset.nodes.length);
  const visiblePointSizes = new Float32Array(dataset.nodes.length);

  dataset.nodes.forEach((node, index) => {
    const position = nodePositions.get(node.id)!;
    pointPositions[index * 3] = position.x;
    pointPositions[index * 3 + 1] = position.y;
    pointPositions[index * 3 + 2] = position.z;
  });

  const pointsGeometry = new THREE.BufferGeometry();
  const pointColorAttribute = new THREE.BufferAttribute(pointColors, 3);
  const pointSizeAttribute = new THREE.BufferAttribute(visiblePointSizes, 1);
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
      baseSize: { value: galaxyMode ? 2.7 : 2.25 },
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
    const distance = 1600 + Math.random() * 2100;
    const angle = Math.random() * Math.PI * 2;
    starPositions[index * 3] = Math.cos(angle) * distance;
    starPositions[index * 3 + 1] = (Math.random() - 0.5) * 900;
    starPositions[index * 3 + 2] = Math.sin(angle) * distance;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setDrawRange(0, galaxyMode ? MAX_STAR_COUNT : QUIET_STAR_COUNT);
  const starMaterial = new THREE.PointsMaterial({
    color: 0xb8c9d9,
    size: 1.25,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  world.add(new THREE.Points(starGeometry, starMaterial));

  const glowTexture = makeGlowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 0.055,
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
    label.position.set(cluster.center.x, cluster.center.y + cluster.radius * 0.85, cluster.center.z);

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
    opacity: 0.34,
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
    opacity: 0.12,
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
      opacity: 0.94,
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
    return accessors.nodeSize(node) * 0.68 * planetSizeMultiplier(node, maxDegree);
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
      .add(new THREE.Vector3(Math.max(18, endpoint.radius * 0.68), Math.max(8, endpoint.radius * 0.34), 0));
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
    setMarkerVisible(entry.marker, endpoint, color, level === 2 ? 0.86 : 0.78, level === 2 ? 0.72 : 0.54);
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
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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

    const spriteScale = Math.max(planetScale * 1.82, 0.4);
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
        pointColors[baseColorOffset] = basePointColors[baseColorOffset] * 0.36;
        pointColors[baseColorOffset + 1] = basePointColors[baseColorOffset + 1] * 0.36;
        pointColors[baseColorOffset + 2] = basePointColors[baseColorOffset + 2] * 0.36;
        return;
      }

      const baseSize = basePointSizes[index];
      const sizeMultiplier = highlightLevel === 3 ? 2.55 : highlightLevel === 2 ? 1.85 : highlightLevel === 1 ? 1.5 : 1;
      visiblePointSizes[index] =
        visibleByGroup || highlightLevel > 0 ? Math.max(baseSize * sizeMultiplier, baseSize + highlightLevel) : 0;

      tmpPointSelectionColor.setRGB(
        basePointColors[baseColorOffset],
        basePointColors[baseColorOffset + 1],
        basePointColors[baseColorOffset + 2],
      );

      if (highlightLevel === 3) tmpPointSelectionColor.set('#ffffff');
      else if (highlightLevel === 2)
        tmpPointSelectionColor.lerp(tmpPointSelectionTargetColor.set(theme?.panelAccentColor ?? '#46f4bc'), 0.74);
      else if (highlightLevel === 1)
        tmpPointSelectionColor.lerp(tmpPointSelectionTargetColor.set(theme?.selectedColor ?? '#d8fff3'), 0.6);
      else if (selectedNodeId || selectedEdgeId) tmpPointSelectionColor.multiplyScalar(0.48);

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
        radius * (selected ? 1.38 : relatedToSelectedEdge || firstDegree ? 1.2 : secondDegree ? 1.14 : hovered ? 1.1 : 1);
      const ringScale =
        radius *
        1.42 *
        (selected ? 1.42 : relatedToSelectedEdge || firstDegree ? 1.24 : secondDegree ? 1.14 : hovered ? 1.08 : 0.92);
      const color = selectionEmphasized
        ? new THREE.Color(
            selected
              ? '#ffffff'
              : relatedToSelectedEdge || firstDegree
                ? (theme?.panelAccentColor ?? '#46f4bc')
                : (theme?.selectedColor ?? '#d8fff3'),
          )
        : hovered
          ? planetColor(nodeColor).multiplyScalar(1.18)
        : hasSelection
          ? dimColor(nodeColor, 0.86)
          : planetColor(nodeColor);

      instanceDummy.position.set(position.x, position.y, position.z);
      instanceDummy.rotation.set(0, (index % 16) * 0.12, 0);
      instanceDummy.scale.setScalar(planetScale);
      instanceDummy.updateMatrix();
      planetMesh.setMatrixAt(index, instanceDummy.matrix);
      planetMesh.setColorAt(index, color);
      updateNodeImageSprite(index, node, position, planetScale);

      if (accessors.nodeRing(node)) {
        instanceDummy.position.set(position.x, position.y, position.z);
        instanceDummy.rotation.set(Math.PI * 0.55, Math.PI * 0.1, Math.PI * ((index % 16) / 16));
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
          : new THREE.Vector3(position.x, position.y + Math.max(nodeSize * 1.85, radius * 1.18), position.z),
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
      const scale = clusterVisual.radius * (galaxyMode ? 1.18 : 0.92);
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
      state.hit.visible = false;
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
      state.hit.visible = visible;
    });
  }

  function updateEdges() {
    edgeStates.forEach((state) => refreshEdgeGeometry(state));
    updateEdgeVisibility();
  }

  dataset.edges.forEach((edge, index) => {
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
    interactiveEdgeMeshes.push(hit);
    world.add(hit);

    const state = { edge, endpoints, geometryKey: spec.geometryKey, hit, id: edgeId, visual };
    edgeStates.set(edgeId, state);
    edgeLookup.set(edgeId, edge);
    edgeEndpoints.set(edgeId, endpoints);
    indexSelectableEdge(edgeId, edge);
  });

  const hoverEdgeEmptyGeometry = new THREE.BufferGeometry();
  const hoverEdgeMaterial = new THREE.MeshBasicMaterial({
    color: theme?.panelAccentColor ?? '#46f4bc',
    transparent: true,
    opacity: 0.34,
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
      hoverEdgeOverlayGeometry = createTubeGeometry(spec.curve, spec.visualSegments, spec.radius * 1.85);
      hoverEdgeOverlay.geometry = hoverEdgeOverlayGeometry;
      hoverEdgeOverlayKey = nextKey;
    }

    hoverEdgeOverlay.visible = true;
  }

  function applyEdgeAppearance() {
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    edgeStates.forEach((state) => {
      const material = state.visual.material as THREE.MeshBasicMaterial;
      const baseOpacity = Number(state.visual.userData.baseOpacity ?? 0.18);
      const selected = selectedEdgeId === state.id;
      const connectedToSelectedNode = Boolean(selectedNodeHighlight?.connectedEdgeIds.has(state.id));
      const hovered = hoveredEdgeId === state.id;
      if (material.wireframe) {
        material.wireframe = false;
        material.needsUpdate = true;
      }
      material.opacity = selected
        ? Math.min(0.86, baseOpacity + 0.56)
        : hovered
          ? Math.min(0.54, baseOpacity + 0.26)
          : connectedToSelectedNode
            ? Math.min(0.82, baseOpacity + 0.52)
            : hasSelection
              ? baseOpacity * 0.28
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
    pointsMaterial.uniforms.globalOpacity.value = hasSelection ? 0.28 : 1;

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
      selectedNodeEndpoint || selectedEndpoints?.source.id === selectedNodeId ? 1.34 : 1.12,
    );
    setMarkerVisible(
      endpointMarkers[1],
      secondaryEndpoint,
      theme?.panelAccentColor ?? '#46f4bc',
      selectedEndpoints?.target.id === selectedNodeId ? 1.34 : 1.12,
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
    pointsMaterial.uniforms.baseSize.value = galaxyMode ? 2.7 : 2.25;
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = galaxyMode ? 0.00068 : 0.00042;
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
      entry.object.visible && entry.object.userData.type === 'edge' && Boolean(entry.object.userData.edgeId);
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
        ? endpoint.position.clone().add(new THREE.Vector3(0, Math.max(12, endpoint.radius * 0.72), 0))
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
    camera.position.copy(target).add(new THREE.Vector3(nodeSize * 6 + 60, nodeSize * 5 + 44, nodeSize * 9 + 150));
    controls.update();
    emitCameraView();
  }

  function focusEdge(edgeId: string) {
    const endpoints = edgeEndpoints.get(edgeId);
    if (!endpoints) return;

    const sourcePosition = endpoints.source.position.clone().applyQuaternion(world.quaternion);
    const targetPosition = endpoints.target.position.clone().applyQuaternion(world.quaternion);
    const midpoint = sourcePosition.clone().lerp(targetPosition, 0.5);
    const distance = Math.max(160, sourcePosition.distanceTo(targetPosition));
    controls.target.copy(midpoint);
    camera.position
      .copy(midpoint)
      .add(new THREE.Vector3(distance * 0.14 + 90, distance * 0.14 + 82, distance * 0.52 + 320));
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

    const distance = 80 * multiplier;
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
  emitCameraView();

  function animate() {
    animationFrame = window.requestAnimationFrame(animate);
    frame += 1;
    const keySpeed = pressedKeys.has('shift') ? 1.75 : 1;
    if (pressedKeys.has('w') || pressedKeys.has('arrowup')) moveCamera('forward', keySpeed * 0.16, true);
    if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) moveCamera('back', keySpeed * 0.16, true);
    if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) moveCamera('left', keySpeed * 0.16, true);
    if (pressedKeys.has('d') || pressedKeys.has('arrowright')) moveCamera('right', keySpeed * 0.16, true);
    if (pressedKeys.has('e')) moveCamera('up', keySpeed * 0.13, true);
    if (pressedKeys.has('q')) moveCamera('down', keySpeed * 0.13, true);
    controls.update();

    const paused = pausedRef.current;
    if (!paused && motion === 'full' && galaxyMode) world.rotation.y += 0.000035;

    if (!paused && motion === 'full') {
      endpointMarkers.forEach((marker, index) => {
        if (!marker.group.visible) return;
        marker.innerRing.rotation.z += 0.006 + index * 0.001;
        marker.outerRing.rotation.z -= 0.004 + index * 0.001;
      });
      nodeHighlightMarkers.forEach(({ marker }, index) => {
        if (!marker.group.visible) return;
        marker.innerRing.rotation.z += 0.004 + index * 0.0002;
        marker.outerRing.rotation.z -= 0.0025 + index * 0.0002;
      });
      if (hoverNodeMarker.group.visible) {
        hoverNodeMarker.ball.rotation.y += 0.004;
      }
    }

    if (hoverPending) processHover();

    if (frame % 2 === 0) {
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

  return {
    focusEdge,
    focusNode,
    moveCamera,
    resetCamera,
    updateAccessors,
    updateActiveGroup,
    updateClusterVisibility: updateClusterVisibilityFromProp,
    updateGalaxyMode,
    updateMotionPreference,
    updatePlanetSizing,
    updateSelection,
    updateTheme,
    dispose: () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
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

function reportRendererFailure<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLElement,
  state: CoreState<NMeta, EMeta, CMeta>,
  reason: GalaxySceneFailureReason,
  message: string,
  error?: unknown,
) {
  const nextFailure: GalaxySceneFailure = { reason, message, error };
  state.runtime?.dispose();
  state.runtime = null;
  clearSceneDom(host as HTMLDivElement);
  state.callbacks.onSceneFailure?.(nextFailure);
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
      state.options = nextOptions;
      if (nextCallbacks) {
        state.callbacks = nextCallbacks;
        state.callbacksRef.current = resolveRendererCallbacks(nextCallbacks);
      }
      configureMotion(state);

      const nextSceneKey = getRendererSceneKey(nextOptions);
      if (nextSceneKey !== state.sceneKey) {
        state.sceneKey = nextSceneKey;
        rebuildRenderer(host, state);
        return;
      }

      state.pausedRef.current = Boolean(nextOptions.paused) || state.resolvedMotion === 'reduced';
      patchRuntime(state);
    },
    dispose: () => {
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
