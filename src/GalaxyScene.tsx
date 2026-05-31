import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getEdgeId, resolveAccessors } from './data';
import {
  canUseDOM,
  detectWebGLAvailability,
  resolveMotionPreference,
  type GalaxyMotionPreference,
  type ResolvedGalaxyMotion,
} from './environment';
import { resolveGraphLayout, type GraphLayoutInput } from './layout';
import {
  buildSceneNodeIndex,
  edgeMatchesActiveGroup,
  getSceneRebuildKey,
  MAJOR_PLANET_LIMIT_ALL,
  selectMajorOverlayNodes,
  writeVisiblePointSizes,
  type SceneNodeIndex,
} from './sceneData';
import { createSceneFallbackViewModel, type GalaxySceneFailure, type GalaxySceneFailureReason } from './sceneFallback';
import type {
  GraphAccessors,
  GraphDataset,
  GraphEdge,
  GraphNode,
  ResolvedAccessors,
  SpaceDirection,
  Vec3,
} from './types';

export type { GalaxyMotionPreference } from './environment';
export type { GalaxySceneFailure, GalaxySceneFailureReason } from './sceneFallback';

export interface CameraCommand {
  type: 'focus' | 'focus-edge' | 'move' | 'reset';
  direction?: SpaceDirection;
  edgeId?: string;
  nodeId?: string;
  nonce: number;
}

export interface GalaxySceneProps<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
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
  motionPreference?: GalaxyMotionPreference;
  onSceneFailure?: (failure: GalaxySceneFailure) => void;
  onSceneReady?: () => void;
  paused?: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (node: GraphNode<NMeta> | null) => void;
  onHoverNode: (node: GraphNode<NMeta> | null) => void;
  onSelectEdge: (edge: GraphEdge<EMeta> | null) => void;
  onHoverEdge: (edge: GraphEdge<EMeta> | null) => void;
}

interface SceneCallbacks<NMeta = unknown, EMeta = unknown> {
  onHoverEdge: (edge: GraphEdge<EMeta> | null) => void;
  onHoverNode: (node: GraphNode<NMeta> | null) => void;
  onSelectEdge: (edge: GraphEdge<EMeta> | null) => void;
  onSelectNode: (node: GraphNode<NMeta> | null) => void;
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
  updateSelection: (selectedNodeId: string | null, selectedEdgeId: string | null) => void;
  updateTheme: (theme: GalaxyGraphTheme | undefined) => void;
  dispose: () => void;
}

interface EdgeEndpoint {
  group?: string;
  id: string;
  isNode: boolean;
  label: string;
  position: THREE.Vector3;
  radius: number;
}

interface EdgeEndpoints {
  source: EdgeEndpoint;
  target: EdgeEndpoint;
}

interface EdgeVisualState<EMeta = unknown> {
  edge: GraphEdge<EMeta>;
  endpoints: EdgeEndpoints;
  geometryKey: string;
  hit: THREE.Mesh;
  id: string;
  visual: THREE.Mesh;
}

interface EndpointMarker {
  group: THREE.Group;
  core: THREE.Mesh;
  innerRing: THREE.Mesh;
  outerRing: THREE.Mesh;
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
const tmpVector = new THREE.Vector3();
const tmpProjected = new THREE.Vector3();
const tmpDirection = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMove = new THREE.Vector3();
const instanceDummy = new THREE.Object3D();

function getThemeKey(theme?: GalaxyGraphTheme) {
  if (!theme) return 'default';

  return JSON.stringify({
    background: theme.background,
    panelAccentColor: theme.panelAccentColor,
    selectedColor: theme.selectedColor,
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
  gradient.addColorStop(0.38, '#e8eee8');
  gradient.addColorStop(0.76, '#a3aaa6');
  gradient.addColorStop(1, '#596165');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  for (let band = 0; band < 8; band += 1) {
    context.fillStyle = band % 2 === 0 ? '#f4f7f2' : '#1a1d22';
    context.globalAlpha = band % 2 === 0 ? 0.32 : 0.22;
    context.beginPath();
    context.ellipse(128, 34 + band * 24, 124, 5 + (band % 4) * 4, band * 0.07, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 0.28;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(92, 82, 34, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 0.07;
  context.fillStyle = '#000000';
  context.beginPath();
  context.arc(172, 170, 78, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function colorToFloatTriplet(color: string) {
  const threeColor = new THREE.Color(color);
  return [threeColor.r, threeColor.g, threeColor.b] as const;
}

function dimColor(color: string, multiplier = 0.32) {
  return new THREE.Color(color).multiplyScalar(multiplier);
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
  clusterLookup: Map<string, EdgeEndpoint>,
  accessors: ResolvedAccessors<NMeta, EMeta>,
): EdgeEndpoint | null {
  const node = nodeLookup.get(id);
  const position = node ? nodePositions.get(node.id) : undefined;
  if (node && position) {
    const radius = Math.max(14, accessors.nodeSize(node) * (node.major ? 2.2 : 5.2));
    return {
      group: node.group,
      id: node.id,
      isNode: true,
      label: node.label ?? node.id,
      position: new THREE.Vector3(position.x, position.y, position.z),
      radius,
    };
  }

  return clusterLookup.get(id) ?? null;
}

function createEndpointMarker(color: string) {
  const group = new THREE.Group();
  group.visible = false;

  const coreGeometry = new THREE.SphereGeometry(1, 24, 16);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.82,
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
    opacity: 0.98,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const innerRing = new THREE.Mesh(ringGeometry, innerRingMaterial);
  innerRing.renderOrder = 32;
  innerRing.rotation.set(Math.PI * 0.54, Math.PI * 0.08, 0);
  group.add(innerRing);

  const outerRing = new THREE.Mesh(ringGeometry, innerRingMaterial.clone());
  outerRing.renderOrder = 32;
  outerRing.rotation.set(Math.PI * 0.5, Math.PI * 0.32, Math.PI * 0.33);
  group.add(outerRing);

  return { group, core, innerRing, outerRing };
}

function setMarkerColor(marker: EndpointMarker, color: string) {
  (marker.core.material as THREE.MeshBasicMaterial).color.set(color);
  (marker.innerRing.material as THREE.MeshBasicMaterial).color.set(color);
  (marker.outerRing.material as THREE.MeshBasicMaterial).color.set(color);
}

function setMarkerVisible(
  marker: EndpointMarker,
  endpoint: EdgeEndpoint | null,
  color: string,
  scaleMultiplier: number,
) {
  marker.group.visible = Boolean(endpoint);
  if (!endpoint) return;

  setMarkerColor(marker, color);
  const scale = Math.max(42, endpoint.radius * scaleMultiplier);
  marker.group.position.copy(endpoint.position);
  marker.core.scale.setScalar(scale * 0.24);
  marker.innerRing.scale.setScalar(scale);
  marker.outerRing.scale.setScalar(scale * 1.34);
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
  const radius = isFilament ? 0.24 : 0.34 + weight * 0.34;
  const opacity = isFilament ? (galaxyMode ? 0.045 : 0.032) : 0.075 + weight * 0.1;
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

function createScene<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLDivElement,
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  initialActiveGroup: string | null,
  initialShowClusters: boolean,
  initialGalaxyMode: boolean,
  initialMotion: ResolvedGalaxyMotion,
  layoutInput: GraphLayoutInput | undefined,
  accessorsInput: GraphAccessors<NMeta, EMeta> | undefined,
  initialTheme: GalaxyGraphTheme | undefined,
  callbacksRef: MutableRefObject<SceneCallbacks<NMeta, EMeta>>,
  pausedRef: MutableRefObject<boolean>,
  onContextLost: (failure: GalaxySceneFailure) => void,
): SceneRuntime<NMeta, EMeta> {
  let activeGroup = initialActiveGroup;
  let showClusters = initialShowClusters;
  let galaxyMode = initialGalaxyMode;
  let motion = initialMotion;
  let selectedNodeId: string | null = null;
  let selectedEdgeId: string | null = null;
  let theme = initialTheme;
  let accessors = resolveAccessors(accessorsInput);
  const graphLayout = resolveGraphLayout(dataset, layoutInput);
  const nodeIndex: SceneNodeIndex<NMeta> = buildSceneNodeIndex(dataset.nodes);

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
  const clusterLookup = new Map<string, EdgeEndpoint>(
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
  const interactiveEdgeMeshes: THREE.Object3D[] = [];

  const pointPositions = new Float32Array(dataset.nodes.length * 3);
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
      uniform float pixelRatio;
      uniform float baseSize;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float attenuation = clamp(300.0 / -mvPosition.z, 0.36, 5.2);
        gl_PointSize = size * baseSize * attenuation * pixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float globalOpacity;
      void main() {
        vec2 uv = gl_PointCoord.xy - vec2(0.5);
        float dist = length(uv);
        float alpha = smoothstep(0.5, 0.08, dist);
        float core = smoothstep(0.16, 0.0, dist);
        gl_FragColor = vec4(vColor * (1.0 + core * 0.46), alpha * 0.35 * globalOpacity);
      }
    `,
  });
  const pointCloud = new THREE.Points(pointsGeometry, pointsMaterial);
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
    map: planetTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    vertexColors: true,
  });
  const planetMesh = new THREE.InstancedMesh(planetGeometry, planetMaterial, MAJOR_PLANET_LIMIT_ALL);
  planetMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  planetMesh.userData.type = 'node-instances';
  planetMesh.count = 0;
  world.add(planetMesh);

  const ringGeometry = new THREE.RingGeometry(1.28, 1.34, 96);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    vertexColors: true,
  });
  const ringMesh = new THREE.InstancedMesh(ringGeometry, ringMaterial, MAJOR_PLANET_LIMIT_ALL);
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringMesh.count = 0;
  world.add(ringMesh);

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

  function updatePointVisibility() {
    writeVisiblePointSizes(visiblePointSizes, basePointSizes, nodeIndex, activeGroup);
    pointSizeAttribute.needsUpdate = true;
  }

  function updatePointAppearance() {
    dataset.nodes.forEach((node, index) => {
      const [r, g, b] = colorToFloatTriplet(accessors.nodeColor(node));
      pointColors[index * 3] = r;
      pointColors[index * 3 + 1] = g;
      pointColors[index * 3 + 2] = b;
      basePointSizes[index] = accessors.nodeSize(node);
    });
    pointColorAttribute.needsUpdate = true;
    updatePointVisibility();
  }

  function updateMajorOverlay() {
    const majorNodes = selectMajorOverlayNodes(nodeIndex, activeGroup);
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    const selectedEndpoints = selectedEdgeId ? (edgeEndpoints.get(selectedEdgeId) ?? null) : null;
    planetInstanceNodeIds.length = 0;
    planetMesh.count = majorNodes.length;
    ringMesh.count = majorNodes.length;

    majorNodes.forEach((node, index) => {
      const position = nodePositions.get(node.id)!;
      const nodeSize = accessors.nodeSize(node);
      const nodeColor = accessors.nodeColor(node);
      const selected = selectedNodeId === node.id;
      const relatedToSelectedEdge = Boolean(
        selectedEndpoints && (selectedEndpoints.source.id === node.id || selectedEndpoints.target.id === node.id),
      );
      const emphasized = selected || relatedToSelectedEdge;
      const planetScale = nodeSize * 0.68 * (selected ? 1.52 : relatedToSelectedEdge ? 1.42 : 1);
      const ringScale = nodeSize * 1.05 * (selected ? 2.28 : relatedToSelectedEdge ? 2.08 : 1);
      const color = emphasized
        ? new THREE.Color(0xffffff)
        : hasSelection
          ? dimColor(nodeColor, 0.34)
          : new THREE.Color(nodeColor);

      instanceDummy.position.set(position.x, position.y, position.z);
      instanceDummy.rotation.set(0, (index % 16) * 0.12, 0);
      instanceDummy.scale.setScalar(planetScale);
      instanceDummy.updateMatrix();
      planetMesh.setMatrixAt(index, instanceDummy.matrix);
      planetMesh.setColorAt(index, color);

      instanceDummy.position.set(position.x, position.y, position.z);
      instanceDummy.rotation.set(Math.PI * 0.55, Math.PI * 0.1, Math.PI * ((index % 16) / 16));
      instanceDummy.scale.setScalar(ringScale);
      instanceDummy.updateMatrix();
      ringMesh.setMatrixAt(index, instanceDummy.matrix);
      ringMesh.setColorAt(index, emphasized ? new THREE.Color(theme?.selectedColor ?? '#ffffff') : color);

      planetInstanceNodeIds[index] = node.id;

      const label = nodeLabelPool[index];
      const labelText = shouldShowMajorLabel(index, activeGroup) ? accessors.nodeLabel(node) : null;
      setSceneLabel(
        label,
        labelText,
        labelText === null ? null : new THREE.Vector3(position.x, position.y + nodeSize * 1.85, position.z),
      );
    });

    for (let index = majorNodes.length; index < nodeLabelPool.length; index += 1) {
      setSceneLabel(nodeLabelPool[index], null, null);
      planetInstanceNodeIds[index] = '';
    }

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
    const source = resolveEndpoint(state.edge.source, nodeLookup, nodePositions, clusterLookup, accessors);
    const target = resolveEndpoint(state.edge.target, nodeLookup, nodePositions, clusterLookup, accessors);
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
      const visible = edgeMatchesActiveGroup(state.endpoints.source.group, state.endpoints.target.group, activeGroup);
      state.visual.visible = visible;
      state.hit.visible = visible;
    });
  }

  function updateEdges() {
    edgeStates.forEach((state) => refreshEdgeGeometry(state));
    updateEdgeVisibility();
  }

  dataset.edges.forEach((edge, index) => {
    const source = resolveEndpoint(edge.source, nodeLookup, nodePositions, clusterLookup, accessors);
    const target = resolveEndpoint(edge.target, nodeLookup, nodePositions, clusterLookup, accessors);
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
  });

  function updateSelection(nextSelectedNodeId: string | null, nextSelectedEdgeId: string | null) {
    selectedNodeId = nextSelectedNodeId;
    selectedEdgeId = nextSelectedEdgeId;
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    const selectedEndpoints = selectedEdgeId ? (edgeEndpoints.get(selectedEdgeId) ?? null) : null;
    pointsMaterial.uniforms.globalOpacity.value = hasSelection ? 0.24 : 1;

    updateMajorOverlay();

    setMarkerVisible(
      endpointMarkers[0],
      selectedEndpoints?.source ?? null,
      theme?.selectedColor ?? '#ffffff',
      selectedEndpoints?.source.id === selectedNodeId ? 1.18 : 1,
    );
    setMarkerVisible(
      endpointMarkers[1],
      selectedEndpoints?.target ?? null,
      theme?.panelAccentColor ?? '#46f4bc',
      selectedEndpoints?.target.id === selectedNodeId ? 1.18 : 1,
    );

    edgeStates.forEach((state) => {
      const material = state.visual.material as THREE.MeshBasicMaterial;
      const baseOpacity = Number(state.visual.userData.baseOpacity ?? 0.18);
      const selected = selectedEdgeId === state.id;
      material.opacity = selected
        ? Math.min(0.86, baseOpacity + 0.56)
        : hasSelection
          ? baseOpacity * 0.18
          : baseOpacity;
      material.depthTest = !selected;
      material.color.set(selected ? '#ffffff' : accessors.edgeColor(state.edge));
      state.visual.renderOrder = selected ? 18 : 0;
      state.visual.scale.setScalar(selected ? 1.12 : 1);
    });
  }

  function clearHover() {
    callbacksRef.current.onHoverNode(null);
    callbacksRef.current.onHoverEdge(null);
  }

  function updateActiveGroup(nextActiveGroup: string | null) {
    activeGroup = nextActiveGroup;
    updatePointVisibility();
    updateClusterVisibility();
    updateEdgeVisibility();
    updateMajorOverlay();
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
  }

  function updateMotionPreference(nextMotion: ResolvedGalaxyMotion) {
    motion = nextMotion;
  }

  function updateTheme(nextTheme: GalaxyGraphTheme | undefined) {
    theme = nextTheme;
    renderer.setClearColor(theme?.background ?? '#07090d', 1);
    updateSelection(selectedNodeId, selectedEdgeId);
  }

  function updateAccessors(nextAccessors: GraphAccessors<NMeta, EMeta> | undefined) {
    accessors = resolveAccessors(nextAccessors);
    updatePointAppearance();
    updateEdges();
    updateSelection(selectedNodeId, selectedEdgeId);
  }

  updatePointAppearance();
  updateClusterVisibility();
  updateEdgeVisibility();
  updateSelection(null, null);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredNodeId: string | null = null;
  let hoveredEdgeId: string | null = null;
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
    const hits = raycaster.intersectObjects([planetMesh, ...interactiveEdgeMeshes], false);
    const hit = hits.find((entry) => entry.object.visible);
    const instanceId = hit?.instanceId;
    const nodeId =
      hit?.object.userData.type === 'node-instances' && instanceId !== undefined
        ? planetInstanceNodeIds[instanceId] || null
        : null;
    const edgeId = (hit?.object.userData.edgeId as string | undefined) ?? null;
    return {
      nodeId,
      edgeId,
      node: nodeId ? (nodeLookup.get(nodeId) ?? null) : null,
      edge: edgeId ? (edgeLookup.get(edgeId) ?? null) : null,
    };
  }

  function processHover() {
    hoverPending = false;
    const { node, edge, nodeId, edgeId } = intersectAt(pendingHoverX, pendingHoverY);
    renderer.domElement.style.cursor = node || edge ? 'pointer' : 'grab';
    if (nodeId !== hoveredNodeId) {
      hoveredNodeId = nodeId;
      callbacksRef.current.onHoverNode(node);
    }
    if (edgeId !== hoveredEdgeId) {
      hoveredEdgeId = edgeId;
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
    const nodeSize = accessors.nodeSize(node);
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(nodeSize * 6 + 60, nodeSize * 5 + 44, nodeSize * 9 + 150));
    controls.update();
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
      .add(new THREE.Vector3(distance * 0.18 + 90, distance * 0.16 + 80, distance * 0.38 + 220));
    controls.update();
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
  }

  function handleContextLost(event: Event) {
    event.preventDefault();
    onContextLost({
      reason: 'context-lost',
      message: 'The WebGL context was lost. Use retry to rebuild the scene.',
    });
  }

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  host.addEventListener('keydown', handleKeyDown);
  host.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', resize);

  function animate() {
    animationFrame = window.requestAnimationFrame(animate);
    frame += 1;
    const keySpeed = pressedKeys.has('shift') ? 2.2 : 1;
    if (pressedKeys.has('w') || pressedKeys.has('arrowup')) moveCamera('forward', keySpeed * 0.28, true);
    if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) moveCamera('back', keySpeed * 0.28, true);
    if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) moveCamera('left', keySpeed * 0.28, true);
    if (pressedKeys.has('d') || pressedKeys.has('arrowright')) moveCamera('right', keySpeed * 0.28, true);
    if (pressedKeys.has('e')) moveCamera('up', keySpeed * 0.22, true);
    if (pressedKeys.has('q')) moveCamera('down', keySpeed * 0.22, true);
    controls.update();

    const paused = pausedRef.current;
    if (!paused && motion === 'full' && galaxyMode) world.rotation.y += 0.000035;

    if (!paused && motion === 'full') {
      endpointMarkers.forEach((marker, index) => {
        if (!marker.group.visible) return;
        marker.innerRing.rotation.z += 0.006 + index * 0.001;
        marker.outerRing.rotation.z -= 0.004 + index * 0.001;
      });
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
    updateSelection,
    updateTheme,
    dispose: () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      host.removeEventListener('keydown', handleKeyDown);
      host.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      glowTexture.dispose();
      planetTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelsRoot.remove();
    },
  };
}

export default function GalaxyScene<NMeta = unknown, EMeta = unknown, CMeta = unknown>({
  dataset,
  activeGroup,
  showClusters,
  galaxyMode,
  layout,
  accessors,
  theme,
  cameraCommand,
  motionPreference = 'system',
  onSceneFailure,
  onSceneReady,
  paused = false,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onHoverNode,
  onSelectEdge,
  onHoverEdge,
}: GalaxySceneProps<NMeta, EMeta, CMeta>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SceneRuntime<NMeta, EMeta> | null>(null);
  const onSceneFailureRef = useRef(onSceneFailure);
  const onSceneReadyRef = useRef(onSceneReady);
  const [failure, setFailure] = useState<GalaxySceneFailure | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [resolvedMotion, setResolvedMotion] = useState(() => resolveMotionPreference(motionPreference));
  const callbacksRef = useRef<SceneCallbacks<NMeta, EMeta>>({
    onHoverEdge,
    onHoverNode,
    onSelectEdge,
    onSelectNode,
  });
  callbacksRef.current = {
    onHoverEdge,
    onHoverNode,
    onSelectEdge,
    onSelectNode,
  };
  onSceneFailureRef.current = onSceneFailure;
  onSceneReadyRef.current = onSceneReady;
  const pausedRef = useRef(paused);
  pausedRef.current = paused || resolvedMotion === 'reduced';

  const themeKey = getThemeKey(theme);
  const stableTheme = useMemo(() => theme, [themeKey]);
  const layoutKey = getLayoutKey(layout);
  const stableLayout = useMemo(() => layout, [layoutKey]);
  const sceneKey = useMemo(() => getSceneRebuildKey(dataset, layoutKey), [dataset, layoutKey]);

  useEffect(() => {
    setResolvedMotion(resolveMotionPreference(motionPreference));
    if (motionPreference !== 'system' || !canUseDOM() || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setResolvedMotion(event.matches ? 'reduced' : 'full');
    if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', handleChange);
    else mediaQuery.addListener?.(handleChange);

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', handleChange);
      else mediaQuery.removeListener?.(handleChange);
    };
  }, [motionPreference]);

  const reportFailure = useCallback((reason: GalaxySceneFailureReason, message: string, error?: unknown) => {
    const nextFailure: GalaxySceneFailure = { reason, message, error };
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    setFailure(nextFailure);
    onSceneFailureRef.current?.(nextFailure);
  }, []);

  const retryScene = useCallback(() => {
    setFailure(null);
    setRetryNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    if (!canUseDOM()) return undefined;

    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    setFailure(null);

    const availability = detectWebGLAvailability();
    if (!availability.available) {
      reportFailure('webgl-unavailable', availability.message ?? 'WebGL is not available in this browser or device.');
      return undefined;
    }

    try {
      runtimeRef.current = createScene(
        host,
        dataset,
        activeGroup,
        showClusters,
        galaxyMode,
        resolvedMotion,
        stableLayout,
        accessors,
        stableTheme,
        callbacksRef,
        pausedRef,
        (nextFailure) => reportFailure(nextFailure.reason, nextFailure.message, nextFailure.error),
      );
      onSceneReadyRef.current?.();
    } catch (error) {
      clearSceneDom(host);
      reportFailure(
        'scene-error',
        error instanceof Error ? error.message : 'The graph scene could not be initialized.',
        error,
      );
    }

    return () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
    // Only dataset/topology/layout rebuild the scene; controls and appearance
    // props are patched into the existing runtime by the effects below.
  }, [sceneKey, dataset, stableLayout, retryNonce, reportFailure]);

  useEffect(() => {
    runtimeRef.current?.updateActiveGroup(activeGroup);
  }, [activeGroup]);

  useEffect(() => {
    runtimeRef.current?.updateClusterVisibility(showClusters);
  }, [showClusters]);

  useEffect(() => {
    runtimeRef.current?.updateGalaxyMode(galaxyMode);
  }, [galaxyMode]);

  useEffect(() => {
    runtimeRef.current?.updateMotionPreference(resolvedMotion);
  }, [resolvedMotion]);

  useEffect(() => {
    runtimeRef.current?.updateAccessors(accessors);
  }, [accessors]);

  useEffect(() => {
    runtimeRef.current?.updateTheme(stableTheme);
  }, [stableTheme]);

  useEffect(() => {
    runtimeRef.current?.updateSelection(selectedNodeId, selectedEdgeId);
  }, [selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    if (!cameraCommand || !runtimeRef.current) return;
    if (cameraCommand.type === 'reset') runtimeRef.current.resetCamera();
    if (cameraCommand.type === 'focus' && cameraCommand.nodeId) runtimeRef.current.focusNode(cameraCommand.nodeId);
    if (cameraCommand.type === 'focus-edge' && cameraCommand.edgeId) runtimeRef.current.focusEdge(cameraCommand.edgeId);
    if (cameraCommand.type === 'move' && cameraCommand.direction)
      runtimeRef.current.moveCamera(cameraCommand.direction, 1.75);
  }, [cameraCommand]);

  const fallback = failure ? createSceneFallbackViewModel(dataset, failure) : null;

  return (
    <div ref={hostRef} className="galaxy-scene">
      {fallback ? (
        <div className="scene-fallback" role="status" aria-live="polite">
          <div>
            <span>Graph renderer</span>
            <h2>{fallback.title}</h2>
            <p>{fallback.message}</p>
          </div>
          <dl>
            <div>
              <dt>Nodes</dt>
              <dd>{fallback.counts.nodes}</dd>
            </div>
            <div>
              <dt>Edges</dt>
              <dd>{fallback.counts.edges}</dd>
            </div>
            <div>
              <dt>Clusters</dt>
              <dd>{fallback.counts.clusters}</dd>
            </div>
          </dl>
          {fallback.canRetry ? (
            <button type="button" onClick={retryScene}>
              Retry renderer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
