import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getEdgeId, resolveAccessors } from './data';
import { resolveGraphLayout, type GraphLayoutInput } from './layout';
import type { GraphAccessors, GraphDataset, GraphEdge, GraphNode, ResolvedAccessors, SpaceDirection, Vec3 } from './types';

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
  /** Visual accessors. Memoize this - a new identity rebuilds the scene. */
  accessors?: GraphAccessors<NMeta, EMeta>;
  theme?: GalaxyGraphTheme;
  cameraCommand: CameraCommand | null;
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
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  labels: HTMLDivElement[];
  edgeLookup: Map<string, GraphEdge<EMeta>>;
  edgeEndpoints: Map<string, EdgeEndpoints>;
  nodeLookup: Map<string, GraphNode<NMeta>>;
  majorNodes: GraphNode<NMeta>[];
  interactiveNodeMeshes: THREE.Object3D[];
  interactiveEdgeMeshes: THREE.Object3D[];
  edgeVisuals: Map<string, THREE.Mesh>;
  nodeRings: Map<string, THREE.Mesh>;
  nodeVisuals: Map<string, THREE.Mesh>;
  endpointMarkers: [EndpointMarker, EndpointMarker];
  pointMaterial: THREE.ShaderMaterial;
  accessors: ResolvedAccessors<NMeta, EMeta>;
  focusEdge: (edgeId: string) => void;
  focusNode: (nodeId: string) => void;
  moveCamera: (direction: SpaceDirection, multiplier?: number) => void;
  resetCamera: () => void;
  dispose: () => void;
}

const CAMERA_HOME = new THREE.Vector3(120, 430, 1540);
const TARGET_HOME = new THREE.Vector3(0, 0, 0);
const tmpVector = new THREE.Vector3();
const tmpProjected = new THREE.Vector3();
const tmpDirection = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMove = new THREE.Vector3();

interface EdgeEndpoint {
  group?: string;
  id: string;
  label: string;
  position: THREE.Vector3;
  radius: number;
}

interface EdgeEndpoints {
  source: EdgeEndpoint;
  target: EdgeEndpoint;
}

interface EndpointMarker {
  group: THREE.Group;
  core: THREE.Mesh;
  innerRing: THREE.Mesh;
  outerRing: THREE.Mesh;
}

export interface GalaxyGraphTheme {
  background?: string;
  panelAccentColor?: string;
  selectedColor?: string;
}

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

function makePlanetTexture(base: string) {
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
    context.fillStyle = band % 3 === 0 ? base : band % 2 === 0 ? '#f4f7f2' : '#1a1d22';
    context.globalAlpha = band % 3 === 0 ? 0.52 : band % 2 === 0 ? 0.32 : 0.22;
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

function filteredNodes<NMeta, EMeta, CMeta>(dataset: GraphDataset<NMeta, EMeta, CMeta>, activeGroup: string | null) {
  if (activeGroup === null) return dataset.nodes;
  return dataset.nodes.filter((node) => node.group === activeGroup);
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
    const radius = Math.max(10, accessors.nodeSize(node) * (node.major ? 1.65 : 3.4));
    return {
      group: node.group,
      id: node.id,
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
    opacity: 0.72,
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

function setMarkerVisible(marker: EndpointMarker, endpoint: EdgeEndpoint | null, color: string, scaleMultiplier: number) {
  marker.group.visible = Boolean(endpoint);
  if (!endpoint) return;

  setMarkerColor(marker, color);
  const scale = Math.max(20, endpoint.radius * scaleMultiplier);
  marker.group.position.copy(endpoint.position);
  marker.core.scale.setScalar(scale * 0.24);
  marker.innerRing.scale.setScalar(scale);
  marker.outerRing.scale.setScalar(scale * 1.34);
}

function edgeMatchesGroup(source: EdgeEndpoint, target: EdgeEndpoint, activeGroup: string | null) {
  if (activeGroup === null) return true;
  return source.group === activeGroup || target.group === activeGroup;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function createScene<NMeta = unknown, EMeta = unknown, CMeta = unknown>(
  host: HTMLDivElement,
  dataset: GraphDataset<NMeta, EMeta, CMeta>,
  activeGroup: string | null,
  showClusters: boolean,
  galaxyMode: boolean,
  layoutInput: GraphLayoutInput | undefined,
  accessorsInput: GraphAccessors<NMeta, EMeta> | undefined,
  theme: GalaxyGraphTheme | undefined,
  callbacksRef: MutableRefObject<SceneCallbacks<NMeta, EMeta>>,
  pausedRef: MutableRefObject<boolean>,
): SceneRuntime<NMeta, EMeta> {
  const accessors = resolveAccessors(accessorsInput);
  const graphLayout = resolveGraphLayout(dataset, layoutInput);
  const labelsRoot = document.createElement('div');
  labelsRoot.className = 'scene-labels';
  host.appendChild(labelsRoot);

  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(width, height);
  renderer.setClearColor(0x07090d, 1);
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

  // All spatial content lives in one rotating group so the point cloud,
  // planets, edges and labels stay in sync when galaxy mode spins the scene.
  const world = new THREE.Group();
  scene.add(world);

  // Make the host focusable so keyboard navigation is scoped to this scene
  // instead of hijacking the embedding app's global key events.
  host.tabIndex = 0;
  host.style.outline = 'none';

  // CanvasTextures are not freed when their material is disposed, so track the
  // per-planet textures and dispose them explicitly on teardown.
  const planetTextures: THREE.Texture[] = [];

  const visibleNodes = filteredNodes(dataset, activeGroup);
  const pointNodes = visibleNodes.filter((node) => !node.major);
  const majorNodes = visibleNodes.filter((node) => node.major).slice(0, activeGroup === null ? 78 : 42);
  const nodePositions = graphLayout.nodePositions;
  const nodeLookup = graphLayout.nodeLookup;
  const clusterLookup = new Map<string, EdgeEndpoint>(
    graphLayout.clusters.map((cluster) => [
      cluster.id,
      {
        group: cluster.group,
        id: cluster.id,
        label: cluster.label,
        position: new THREE.Vector3(cluster.center.x, cluster.center.y, cluster.center.z),
        radius: Math.max(28, cluster.radius * 0.42),
      },
    ]),
  );
  const edgeLookup = new Map<string, GraphEdge<EMeta>>();
  const edgeEndpoints = new Map<string, EdgeEndpoints>();
  const labels: HTMLDivElement[] = [];
  const interactiveNodeMeshes: THREE.Object3D[] = [];
  const interactiveEdgeMeshes: THREE.Object3D[] = [];
  const edgeVisuals = new Map<string, THREE.Mesh>();
  const nodeRings = new Map<string, THREE.Mesh>();
  const nodeVisuals = new Map<string, THREE.Mesh>();

  const positions = new Float32Array(pointNodes.length * 3);
  const colors = new Float32Array(pointNodes.length * 3);
  const sizes = new Float32Array(pointNodes.length);

  pointNodes.forEach((node, index) => {
    const position = nodePositions.get(node.id)!;
    positions[index * 3] = position.x;
    positions[index * 3 + 1] = position.y;
    positions[index * 3 + 2] = position.z;
    const [r, g, b] = colorToFloatTriplet(accessors.nodeColor(node));
    colors[index * 3] = r;
    colors[index * 3 + 1] = g;
    colors[index * 3 + 2] = b;
    sizes[index] = accessors.nodeSize(node);
  });

  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  pointsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

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
  const starCount = galaxyMode ? 2400 : 1100;
  const starPositions = new Float32Array(starCount * 3);
  for (let index = 0; index < starCount; index += 1) {
    const distance = 1600 + Math.random() * 2100;
    const angle = Math.random() * Math.PI * 2;
    starPositions[index * 3] = Math.cos(angle) * distance;
    starPositions[index * 3 + 1] = (Math.random() - 0.5) * 900;
    starPositions[index * 3 + 2] = Math.sin(angle) * distance;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
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

  const activeClusters = activeGroup === null
    ? graphLayout.clusters
    : graphLayout.clusters.filter((cluster) => cluster.group === activeGroup);

  activeClusters.forEach((cluster, index) => {
    const sprite = new THREE.Sprite(glowMaterial.clone());
    sprite.position.set(cluster.center.x, cluster.center.y, cluster.center.z);
    const scale = cluster.radius * (galaxyMode ? 1.18 : 0.92);
    sprite.scale.set(scale, scale, 1);
    world.add(sprite);

    if (showClusters && shouldShowClusterLabel(index, activeGroup)) {
      const label = makeLabel(cluster.label, 'cluster-label');
      labelsRoot.appendChild(label);
      labels.push(label);
      label.dataset.x = String(cluster.center.x);
      label.dataset.y = String(cluster.center.y + cluster.radius * 0.85);
      label.dataset.z = String(cluster.center.z);
    }
  });

  dataset.edges.forEach((edge, index) => {
    const source = resolveEndpoint(edge.source, nodeLookup, nodePositions, clusterLookup, accessors);
    const target = resolveEndpoint(edge.target, nodeLookup, nodePositions, clusterLookup, accessors);
    if (!source || !target || !edgeMatchesGroup(source, target, activeGroup)) return;

    const isFilament = edge.kind === 'filament';
    const weight = accessors.edgeWeight(edge);
    const edgeId = getEdgeId(edge, index);
    const lift = isFilament ? (galaxyMode ? 86 : 38) : 24 + weight * 42;
    const curve = curvedEdgeCurve(source.position, target.position, lift);
    const color = accessors.edgeColor(edge);
    const radius = isFilament ? 0.24 : 0.34 + weight * 0.34;
    const opacity = isFilament ? (galaxyMode ? 0.045 : 0.032) : 0.075 + weight * 0.1;
    const geometry = new THREE.TubeGeometry(curve, isFilament ? 36 : 28, radius, 6, false);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const visual = new THREE.Mesh(geometry, material);
    visual.userData.edgeId = edgeId;
    visual.userData.baseOpacity = opacity;
    edgeVisuals.set(edgeId, visual);
    edgeLookup.set(edgeId, edge);
    edgeEndpoints.set(edgeId, { source, target });
    world.add(visual);

    const hitGeometry = new THREE.TubeGeometry(curve, isFilament ? 16 : 18, isFilament ? 10 : 8, 6, false);
    const hitMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
    hitMesh.userData.edgeId = edgeId;
    hitMesh.userData.type = 'edge';
    interactiveEdgeMeshes.push(hitMesh);
    world.add(hitMesh);
  });

  const planetGeometry = new THREE.SphereGeometry(1, 36, 24);
  const ringGeometry = new THREE.RingGeometry(1.28, 1.34, 96);
  const endpointMarkers: [EndpointMarker, EndpointMarker] = [
    createEndpointMarker(theme?.selectedColor ?? '#ffffff'),
    createEndpointMarker(theme?.panelAccentColor ?? '#46f4bc'),
  ];
  endpointMarkers.forEach((marker) => world.add(marker.group));

  majorNodes.forEach((node, index) => {
    const nodeColor = accessors.nodeColor(node);
    const nodeSize = accessors.nodeSize(node);
    const position = nodePositions.get(node.id)!;
    const planetTexture = makePlanetTexture(nodeColor);
    planetTextures.push(planetTexture);
    const material = new THREE.MeshBasicMaterial({
      map: planetTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(planetGeometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.scale.setScalar(nodeSize * 0.68);
    mesh.userData.nodeId = node.id;
    mesh.userData.baseScale = nodeSize * 0.68;
    mesh.userData.baseOpacity = 0.92;
    mesh.userData.type = 'node';
    interactiveNodeMeshes.push(mesh);
    nodeVisuals.set(node.id, mesh);
    world.add(mesh);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(nodeColor),
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(mesh.position);
    ring.scale.setScalar(nodeSize * 1.05);
    ring.rotation.set(Math.PI * 0.55, Math.PI * 0.1, Math.PI * ((index % 16) / 16));
    ring.userData.baseScale = nodeSize * 1.05;
    ring.userData.baseOpacity = 0.16;
    nodeRings.set(node.id, ring);
    world.add(ring);

    const labelText = accessors.nodeLabel(node);
    if (labelText !== null && shouldShowMajorLabel(index, activeGroup)) {
      const label = makeLabel(labelText, 'node-label');
      labelsRoot.appendChild(label);
      labels.push(label);
      label.dataset.x = String(position.x);
      label.dataset.y = String(position.y + nodeSize * 1.85);
      label.dataset.z = String(position.z);
    }
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredNodeId: string | null = null;
  let hoveredEdgeId: string | null = null;
  let animationFrame = 0;
  let frame = 0;
  const pressedKeys = new Set<string>();
  // Drag-vs-click: only treat a pointer release as a selection when it barely
  // moved, so orbiting the camera from empty space never clears the selection.
  const CLICK_SLOP_SQ = 36;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDownValid = false;
  // Hover is the hot path (a raycast against every node + edge mesh). Coalesce
  // pointer moves to at most one raycast per rendered frame.
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
    const hit = raycaster.intersectObjects([...interactiveNodeMeshes, ...interactiveEdgeMeshes], false)[0];
    const nodeId = (hit?.object.userData.nodeId as string | undefined) ?? null;
    const edgeId = (hit?.object.userData.edgeId as string | undefined) ?? null;
    return {
      nodeId,
      edgeId,
      node: nodeId ? nodeLookup.get(nodeId) ?? null : null,
      edge: edgeId ? edgeLookup.get(edgeId) ?? null : null,
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
    // Nodes are authored in world-local space; apply the group's current
    // rotation so focus aims at where the planet actually is on screen.
    const target = new THREE.Vector3(position.x, position.y, position.z).applyQuaternion(world.quaternion);
    const nodeSize = accessors.nodeSize(node);
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(nodeSize * 6 + 60, nodeSize * 5 + 44, nodeSize * 9 + 150));
    controls.update();
  }

  function focusEdge(edgeId: string) {
    const edge = edgeLookup.get(edgeId);
    if (!edge) return;
    const source = resolveEndpoint(edge.source, nodeLookup, nodePositions, clusterLookup, accessors);
    const target = resolveEndpoint(edge.target, nodeLookup, nodePositions, clusterLookup, accessors);
    if (!source || !target) return;

    const sourcePosition = source.position.clone().applyQuaternion(world.quaternion);
    const targetPosition = target.position.clone().applyQuaternion(world.quaternion);
    const midpoint = sourcePosition.clone().lerp(targetPosition, 0.5);
    const distance = Math.max(160, sourcePosition.distanceTo(targetPosition));
    controls.target.copy(midpoint);
    camera.position.copy(midpoint).add(new THREE.Vector3(distance * 0.18 + 90, distance * 0.16 + 80, distance * 0.38 + 220));
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
    // The animation loop calls controls.update() once per frame, so per-frame
    // keyboard moves skip the redundant update.
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

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
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
    if (!paused && galaxyMode) world.rotation.y += 0.000035;

    if (!paused) {
      for (let index = 0; index < interactiveNodeMeshes.length; index += 1) {
        const mesh = interactiveNodeMeshes[index];
        if (mesh) mesh.rotation.y += 0.0022 + (index % 5) * 0.0003;
      }
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
        // Labels are anchored to world-local coordinates; rotate them with the
        // group so they track the points and planets they annotate.
        tmpVector.set(Number(label.dataset.x), Number(label.dataset.y), Number(label.dataset.z)).applyQuaternion(world.quaternion);
        setLabelPosition(label, tmpVector, camera, currentWidth, currentHeight);
      });
    }

    renderer.render(scene, camera);
  }

  animate();

  return {
    renderer,
    camera,
    controls,
    scene,
    labels,
    edgeLookup,
    edgeEndpoints,
    nodeLookup,
    majorNodes,
    interactiveNodeMeshes,
    interactiveEdgeMeshes,
    edgeVisuals,
    nodeRings,
    nodeVisuals,
    endpointMarkers,
    pointMaterial: pointsMaterial,
    accessors,
    focusEdge,
    focusNode,
    moveCamera,
    resetCamera,
    dispose: () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      host.removeEventListener('keydown', handleKeyDown);
      host.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      // Material.dispose() leaves bound textures on the GPU, so free them here.
      planetTextures.forEach((texture) => texture.dispose());
      glowMaterial.dispose();
      glowTexture.dispose();
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
  // Kept in a ref so toggling pause never tears down and rebuilds the scene.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const themeKey = getThemeKey(theme);
  const stableTheme = useMemo(() => theme, [themeKey]);
  const layoutKey = getLayoutKey(layout);
  const stableLayout = useMemo(() => layout, [layoutKey]);

  const sceneKey = useMemo(
    () =>
      [
        dataset.generatedAt,
        dataset.nodes.length,
        dataset.edges.length,
        dataset.clusters?.length ?? 0,
        activeGroup ?? '*',
        showClusters,
        galaxyMode,
        themeKey,
        layoutKey,
      ].join(':'),
    [
      activeGroup,
      dataset.clusters?.length,
      dataset.edges.length,
      dataset.generatedAt,
      dataset.nodes.length,
      galaxyMode,
      layoutKey,
      showClusters,
      themeKey,
    ],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    runtimeRef.current?.dispose();
    runtimeRef.current = createScene(
      host,
      dataset,
      activeGroup,
      showClusters,
      galaxyMode,
      stableLayout,
      accessors,
      stableTheme,
      callbacksRef,
      pausedRef,
    );

    return () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
    // `accessors` identity controls visual rebuilds; memoize it upstream.
  }, [sceneKey, dataset, activeGroup, showClusters, galaxyMode, stableLayout, accessors, stableTheme]);

  useEffect(() => {
    if (!cameraCommand || !runtimeRef.current) return;
    if (cameraCommand.type === 'reset') runtimeRef.current.resetCamera();
    if (cameraCommand.type === 'focus' && cameraCommand.nodeId) runtimeRef.current.focusNode(cameraCommand.nodeId);
    if (cameraCommand.type === 'focus-edge' && cameraCommand.edgeId) runtimeRef.current.focusEdge(cameraCommand.edgeId);
    if (cameraCommand.type === 'move' && cameraCommand.direction) runtimeRef.current.moveCamera(cameraCommand.direction, 1.75);
  }, [cameraCommand]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    const edgeEndpoints = selectedEdgeId ? runtime.edgeEndpoints.get(selectedEdgeId) ?? null : null;
    runtime.pointMaterial.uniforms.globalOpacity.value = hasSelection ? 0.24 : 1;

    runtime.interactiveNodeMeshes.forEach((mesh) => {
      const nodeId = mesh.userData.nodeId as string;
      const selected = selectedNodeId === nodeId;
      const relatedToSelectedEdge = Boolean(
        edgeEndpoints && (edgeEndpoints.source.id === nodeId || edgeEndpoints.target.id === nodeId),
      );
      const emphasized = selected || relatedToSelectedEdge;
      const baseScale = Number(mesh.userData.baseScale ?? 1);
      const material = (mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mesh.scale.setScalar(baseScale * (selected ? 1.52 : relatedToSelectedEdge ? 1.42 : 1));
      mesh.renderOrder = emphasized ? 20 : 0;
      material.depthTest = !emphasized;
      material.opacity = hasSelection && !emphasized ? 0.16 : Number(mesh.userData.baseOpacity ?? 0.92);
      material.color.set(emphasized ? 0xffffff : hasSelection ? 0x6f7977 : 0xffffff);

      const ring = runtime.nodeRings.get(nodeId);
      if (ring) {
        const ringMaterial = ring.material as THREE.MeshBasicMaterial;
        ring.scale.setScalar(Number(ring.userData.baseScale ?? 1) * (selected ? 2.28 : relatedToSelectedEdge ? 2.08 : 1));
        ring.renderOrder = emphasized ? 21 : 0;
        ringMaterial.color.set(
          emphasized
            ? stableTheme?.selectedColor ?? '#ffffff'
            : runtime.accessors.nodeColor(runtime.nodeLookup.get(nodeId)!),
        );
        ringMaterial.opacity = emphasized ? 0.96 : hasSelection ? 0.03 : Number(ring.userData.baseOpacity ?? 0.16);
      }
    });
  }, [selectedEdgeId, selectedNodeId, stableTheme]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    const edgeEndpoints = selectedEdgeId ? runtime.edgeEndpoints.get(selectedEdgeId) ?? null : null;
    runtime.pointMaterial.uniforms.globalOpacity.value = hasSelection ? 0.24 : 1;

    setMarkerVisible(
      runtime.endpointMarkers[0],
      edgeEndpoints?.source ?? null,
      stableTheme?.selectedColor ?? '#ffffff',
      edgeEndpoints?.source.id === selectedNodeId ? 1.18 : 1,
    );
    setMarkerVisible(
      runtime.endpointMarkers[1],
      edgeEndpoints?.target ?? null,
      stableTheme?.panelAccentColor ?? '#46f4bc',
      edgeEndpoints?.target.id === selectedNodeId ? 1.18 : 1,
    );

    runtime.edgeVisuals.forEach((mesh, edgeId) => {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const baseOpacity = Number(mesh.userData.baseOpacity ?? 0.18);
      const selected = selectedEdgeId === edgeId;
      material.opacity = selected ? Math.min(0.86, baseOpacity + 0.56) : hasSelection ? baseOpacity * 0.18 : baseOpacity;
      material.depthTest = !selected;
      material.color.set(selected ? '#ffffff' : runtime.accessors.edgeColor(runtime.edgeLookup.get(edgeId)!));
      mesh.renderOrder = selected ? 18 : 0;
      mesh.scale.setScalar(selected ? 1.12 : 1);
    });
  }, [selectedEdgeId, selectedNodeId, stableTheme]);

  return <div ref={hostRef} className="galaxy-scene" />;
}
