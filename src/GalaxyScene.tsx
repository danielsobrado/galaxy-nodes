import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getEdgeId, getNodeColor } from './data';
import type { Category, GraphDataset, GraphEdge, GraphNode, SpaceDirection } from './types';

export interface CameraCommand {
  type: 'focus' | 'focus-edge' | 'move' | 'reset';
  direction?: SpaceDirection;
  edgeId?: string;
  nodeId?: string;
  nonce: number;
}

export interface GalaxySceneProps {
  dataset: GraphDataset;
  activeCategory: Category;
  showClusters: boolean;
  galaxyMode: boolean;
  sharpMoney: boolean;
  theme?: GalaxyGraphTheme;
  cameraCommand: CameraCommand | null;
  paused?: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (node: GraphNode | null) => void;
  onHoverNode: (node: GraphNode | null) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
  onHoverEdge: (edge: GraphEdge | null) => void;
}

interface SceneCallbacks {
  onHoverEdge: (edge: GraphEdge | null) => void;
  onHoverNode: (node: GraphNode | null) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
  onSelectNode: (node: GraphNode | null) => void;
}

interface SceneRuntime {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  labels: HTMLDivElement[];
  edgeLookup: Map<string, GraphEdge>;
  nodeLookup: Map<string, GraphNode>;
  majorNodes: GraphNode[];
  interactiveNodeMeshes: THREE.Object3D[];
  interactiveEdgeMeshes: THREE.Object3D[];
  edgeVisuals: Map<string, THREE.Mesh>;
  nodeRings: Map<string, THREE.Mesh>;
  nodeVisuals: Map<string, THREE.Mesh>;
  pointMaterial: THREE.ShaderMaterial;
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
  category: Exclude<Category, 'All'>;
  label: string;
  position: THREE.Vector3;
}

export interface GalaxyGraphTheme {
  background?: string;
  categoryColors?: Partial<Record<Exclude<Category, 'All'>, string>>;
  noColor?: string;
  panelAccentColor?: string;
  selectedColor?: string;
  yesColor?: string;
}

function getThemeKey(theme?: GalaxyGraphTheme) {
  if (!theme) return 'default';

  return JSON.stringify({
    background: theme.background,
    categoryColors: Object.entries(theme.categoryColors ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    noColor: theme.noColor,
    panelAccentColor: theme.panelAccentColor,
    selectedColor: theme.selectedColor,
    yesColor: theme.yesColor,
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

function makePlanetTexture(node: GraphNode, theme?: GalaxyGraphTheme) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const base = getNodeColor(node, false, theme?.categoryColors, {
    no: theme?.noColor,
    yes: theme?.yesColor,
  });
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

function filteredNodes(dataset: GraphDataset, activeCategory: Category) {
  if (activeCategory === 'All') return dataset.nodes;
  return dataset.nodes.filter((node) => node.category === activeCategory);
}

function shouldShowMajorLabel(node: GraphNode, index: number, activeCategory: Category) {
  if (activeCategory !== 'All') return index < 10 || (node.score > 86 && index % 3 === 0);
  return index < 4 || (node.score > 94 && index % 11 === 0);
}

function shouldShowClusterLabel(index: number, activeCategory: Category) {
  if (activeCategory !== 'All') return index < 4;
  return index === 3 || index === 9;
}

function edgeColor(edge: GraphEdge) {
  if (edge.kind === 'signal') return 0x46f4bc;
  if (edge.kind === 'trade') return 0xff9d66;
  return 0xaeb8c2;
}

function resolveEndpoint(
  id: string,
  nodeLookup: Map<string, GraphNode>,
  clusterLookup: Map<string, EdgeEndpoint>,
) {
  const node = nodeLookup.get(id);
  if (node) {
    return {
      category: node.category,
      label: node.label,
      position: new THREE.Vector3(node.position.x, node.position.y, node.position.z),
    };
  }

  return clusterLookup.get(id) ?? null;
}

function edgeMatchesCategory(edge: GraphEdge, source: EdgeEndpoint, target: EdgeEndpoint, activeCategory: Category) {
  if (activeCategory === 'All') return true;
  return source.category === activeCategory || target.category === activeCategory;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function createScene(
  host: HTMLDivElement,
  dataset: GraphDataset,
  activeCategory: Category,
  showClusters: boolean,
  galaxyMode: boolean,
  sharpMoney: boolean,
  theme: GalaxyGraphTheme | undefined,
  callbacksRef: MutableRefObject<SceneCallbacks>,
  pausedRef: MutableRefObject<boolean>,
): SceneRuntime {
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

  const visibleNodes = filteredNodes(dataset, activeCategory);
  const pointNodes = visibleNodes.filter((node) => !node.isMajor);
  const majorNodes = visibleNodes.filter((node) => node.isMajor).slice(0, activeCategory === 'All' ? 78 : 42);
  const nodeLookup = new Map(dataset.nodes.map((node) => [node.id, node]));
  const clusterLookup = new Map<string, EdgeEndpoint>(
    dataset.clusters.map((cluster) => [
      cluster.id,
      {
        category: cluster.category,
        label: cluster.label,
        position: new THREE.Vector3(cluster.center.x, cluster.center.y, cluster.center.z),
      },
    ]),
  );
  const edgeLookup = new Map<string, GraphEdge>();
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
    positions[index * 3] = node.position.x;
    positions[index * 3 + 1] = node.position.y;
    positions[index * 3 + 2] = node.position.z;
    const [r, g, b] = colorToFloatTriplet(
      getNodeColor(node, sharpMoney, theme?.categoryColors, {
        no: theme?.noColor,
        yes: theme?.yesColor,
      }),
    );
    colors[index * 3] = r;
    colors[index * 3 + 1] = g;
    colors[index * 3 + 2] = b;
    sizes[index] = node.size * (sharpMoney && node.score > 76 ? 1.5 : 1);
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

  const activeClusters = activeCategory === 'All'
    ? dataset.clusters
    : dataset.clusters.filter((cluster) => cluster.category === activeCategory);

  activeClusters.forEach((cluster, index) => {
    const sprite = new THREE.Sprite(glowMaterial.clone());
    sprite.position.set(cluster.center.x, cluster.center.y, cluster.center.z);
    const scale = cluster.radius * (galaxyMode ? 1.18 : 0.92);
    sprite.scale.set(scale, scale, 1);
    world.add(sprite);

    if (showClusters && shouldShowClusterLabel(index, activeCategory)) {
      const label = makeLabel(cluster.label, 'cluster-label');
      labelsRoot.appendChild(label);
      labels.push(label);
      label.dataset.x = String(cluster.center.x);
      label.dataset.y = String(cluster.center.y + cluster.radius * 0.85);
      label.dataset.z = String(cluster.center.z);
    }
  });

  dataset.edges.forEach((edge, index) => {
    const source = resolveEndpoint(edge.source, nodeLookup, clusterLookup);
    const target = resolveEndpoint(edge.target, nodeLookup, clusterLookup);
    if (!source || !target || !edgeMatchesCategory(edge, source, target, activeCategory)) return;

    const edgeId = getEdgeId(edge, index);
    const lift = edge.kind === 'filament' ? (galaxyMode ? 86 : 38) : 24 + edge.weight * 42;
    const curve = curvedEdgeCurve(source.position, target.position, lift);
    const color = edgeColor(edge);
    const radius = edge.kind === 'filament' ? 0.24 : 0.34 + edge.weight * 0.34;
    const opacity = edge.kind === 'filament' ? (galaxyMode ? 0.045 : 0.032) : 0.075 + edge.weight * 0.1;
    const geometry = new THREE.TubeGeometry(curve, edge.kind === 'filament' ? 36 : 28, radius, 6, false);
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
    world.add(visual);

    const hitGeometry = new THREE.TubeGeometry(curve, edge.kind === 'filament' ? 16 : 18, edge.kind === 'filament' ? 10 : 8, 6, false);
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

  majorNodes.forEach((node, index) => {
    const planetTexture = makePlanetTexture(node, theme);
    planetTextures.push(planetTexture);
    const material = new THREE.MeshBasicMaterial({
      map: planetTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(planetGeometry, material);
    mesh.position.set(node.position.x, node.position.y, node.position.z);
    mesh.scale.setScalar(node.size * 0.68);
    mesh.userData.nodeId = node.id;
    mesh.userData.baseScale = node.size * 0.68;
    mesh.userData.baseOpacity = 0.92;
    mesh.userData.type = 'node';
    interactiveNodeMeshes.push(mesh);
    nodeVisuals.set(node.id, mesh);
    world.add(mesh);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(
        getNodeColor(node, sharpMoney, theme?.categoryColors, {
          no: theme?.noColor,
          yes: theme?.yesColor,
        }),
      ),
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(mesh.position);
    ring.scale.setScalar(node.size * 1.05);
    ring.rotation.set(Math.PI * 0.55, Math.PI * 0.1, Math.PI * (node.score / 100));
    ring.userData.baseScale = node.size * 1.05;
    ring.userData.baseOpacity = 0.16;
    nodeRings.set(node.id, ring);
    world.add(ring);

    if (shouldShowMajorLabel(node, index, activeCategory)) {
      const label = makeLabel(`${Math.round(node.score)}% ${node.sentiment.toUpperCase()}`, 'node-label');
      labelsRoot.appendChild(label);
      labels.push(label);
      label.dataset.x = String(node.position.x);
      label.dataset.y = String(node.position.y + node.size * 1.85);
      label.dataset.z = String(node.position.z);
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
    if (!node) return;
    // Nodes are authored in world-local space; apply the group's current
    // rotation so focus aims at where the planet actually is on screen.
    const target = new THREE.Vector3(node.position.x, node.position.y, node.position.z).applyQuaternion(world.quaternion);
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(node.size * 6 + 60, node.size * 5 + 44, node.size * 9 + 150));
    controls.update();
  }

  function focusEdge(edgeId: string) {
    const edge = edgeLookup.get(edgeId);
    if (!edge) return;
    const source = resolveEndpoint(edge.source, nodeLookup, clusterLookup);
    const target = resolveEndpoint(edge.target, nodeLookup, clusterLookup);
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
      majorNodes.forEach((node, index) => {
        const mesh = interactiveNodeMeshes[index];
        if (mesh) {
          mesh.rotation.y += 0.0022 + (node.score / 100) * 0.001;
        }
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
    nodeLookup,
    majorNodes,
    interactiveNodeMeshes,
    interactiveEdgeMeshes,
    edgeVisuals,
    nodeRings,
    nodeVisuals,
    pointMaterial: pointsMaterial,
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

export default function GalaxyScene({
  dataset,
  activeCategory,
  showClusters,
  galaxyMode,
  sharpMoney,
  theme,
  cameraCommand,
  paused = false,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onHoverNode,
  onSelectEdge,
  onHoverEdge,
}: GalaxySceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const callbacksRef = useRef<SceneCallbacks>({
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

  const sceneKey = useMemo(
    () =>
      [
        dataset.generatedAt,
        dataset.nodes.length,
        dataset.edges.length,
        dataset.clusters.length,
        activeCategory,
        showClusters,
        galaxyMode,
        sharpMoney,
        themeKey,
      ].join(':'),
    [activeCategory, dataset.clusters.length, dataset.edges.length, dataset.generatedAt, dataset.nodes.length, galaxyMode, sharpMoney, showClusters, themeKey],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    runtimeRef.current?.dispose();
    runtimeRef.current = createScene(
      host,
      dataset,
      activeCategory,
      showClusters,
      galaxyMode,
      sharpMoney,
      stableTheme,
      callbacksRef,
      pausedRef,
    );

    return () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [sceneKey, dataset, activeCategory, showClusters, galaxyMode, sharpMoney, stableTheme]);

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
    runtime.pointMaterial.uniforms.globalOpacity.value = hasSelection ? 0.24 : 1;

    runtime.interactiveNodeMeshes.forEach((mesh) => {
      const nodeId = mesh.userData.nodeId as string;
      const selected = selectedNodeId === nodeId;
      const baseScale = Number(mesh.userData.baseScale ?? 1);
      const material = (mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mesh.scale.setScalar(baseScale * (selected ? 1.52 : 1));
      mesh.renderOrder = selected ? 20 : 0;
      material.depthTest = !selected;
      material.opacity = hasSelection && !selected ? 0.2 : Number(mesh.userData.baseOpacity ?? 0.92);
      material.color.set(selected ? 0xffffff : hasSelection ? 0x808987 : 0xffffff);

      const ring = runtime.nodeRings.get(nodeId);
      if (ring) {
        const ringMaterial = ring.material as THREE.MeshBasicMaterial;
        ring.scale.setScalar(Number(ring.userData.baseScale ?? 1) * (selected ? 2.28 : 1));
        ring.renderOrder = selected ? 21 : 0;
        ringMaterial.color.set(
          selected
            ? stableTheme?.selectedColor ?? 0xffffff
            : getNodeColor(runtime.nodeLookup.get(nodeId)!, true, stableTheme?.categoryColors, {
                no: stableTheme?.noColor,
                yes: stableTheme?.yesColor,
              }),
        );
        ringMaterial.opacity = selected ? 0.96 : hasSelection ? 0.035 : Number(ring.userData.baseOpacity ?? 0.16);
      }
    });
  }, [selectedEdgeId, selectedNodeId, stableTheme]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    runtime.pointMaterial.uniforms.globalOpacity.value = hasSelection ? 0.24 : 1;

    runtime.edgeVisuals.forEach((mesh, edgeId) => {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const baseOpacity = Number(mesh.userData.baseOpacity ?? 0.18);
      const selected = selectedEdgeId === edgeId;
      material.opacity = selected ? Math.min(0.66, baseOpacity + 0.38) : hasSelection ? baseOpacity * 0.24 : baseOpacity;
      material.depthTest = !selected;
      material.color.set(selected ? 0xffffff : edgeColor(runtime.edgeLookup.get(edgeId)!));
      mesh.renderOrder = selected ? 18 : 0;
      mesh.scale.setScalar(selected ? 1.06 : 1);
    });
  }, [selectedEdgeId, selectedNodeId]);

  return <div ref={hostRef} className="galaxy-scene" />;
}
