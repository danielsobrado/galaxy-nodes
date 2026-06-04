import * as THREE from 'three';
import type { GraphNode, ResolvedAccessors, Vec3 } from '../../domain/types';
import type { ResolvedGalaxyGraphTheme } from '../rendererConfig';
import { MAJOR_PLANET_LIMIT_ALL, type ResolvedPlanetSizing } from '../sceneData';
import {
  DIM_COLOR_MULTIPLIER,
  MAJOR_LABEL_NODE_SIZE_FACTOR,
  MAJOR_LABEL_RADIUS_FACTOR,
  NODE_IMAGE_MAX_ANISOTROPY,
  NODE_IMAGE_MIN_SCALE,
  NODE_IMAGE_SCALE_FACTOR,
  NODE_IMAGE_SPRITE_OPACITY,
  PLANET_HOVER_BRIGHTEN,
  PLANET_SCALE_HOVERED,
  PLANET_SCALE_RELATED,
  PLANET_SCALE_SECOND_DEGREE,
  PLANET_SCALE_SELECTED,
  PLANET_YAW_CYCLE,
  PLANET_YAW_STEP,
  RING_SCALE_BASE,
  RING_SCALE_HOVERED,
  RING_SCALE_IDLE,
  RING_SCALE_RELATED,
  RING_SCALE_SECOND_DEGREE,
  RING_SCALE_SELECTED,
  RING_TILT_X,
  RING_TILT_Y,
} from '../sceneConstants';
import { dimColor, makePlanetTexture, planetColor } from '../materials';
import { makeSceneLabel, setSceneLabel, shouldShowMajorLabel } from '../labels';
import type { EdgeEndpoints, SceneLabel } from '../sceneTypes';
import type { NodeSizing } from './nodeSizing';
import type { SelectionState } from './sceneContext';
import { setMaterialBlending, themeBlending } from './themeRuntime';

const instanceDummy = new THREE.Object3D();

export interface PlanetOverlayDeps<NMeta = unknown, EMeta = unknown> {
  world: THREE.Object3D;
  labelsRoot: HTMLDivElement;
  /** Shared label pool projected by the animation loop; major-node labels are appended to it. */
  labels: SceneLabel[];
  renderer: THREE.WebGLRenderer;
  nodePositions: Map<string, Vec3>;
  edgeEndpoints: Map<string, EdgeEndpoints>;
  accessors: () => ResolvedAccessors<NMeta, EMeta>;
  theme: () => ResolvedGalaxyGraphTheme;
  activeGroup: () => string | null;
  planetSizing: () => ResolvedPlanetSizing;
  /** Live selection record, read by reference (mutated in place by the orchestrator). */
  selection: SelectionState;
  nodeSizing: NodeSizing<NMeta>;
}

export interface PlanetOverlay {
  /** The instanced planet mesh, used as a raycast target. */
  readonly mesh: THREE.InstancedMesh;
  /** Node id rendered at a planet instance slot ('' when the slot is unused). */
  nodeIdAt(instanceId: number): string;
  /** Rebuild the major-node planet/ring instances, node images, and labels. */
  update(): void;
  setTheme(): void;
  dispose(): void;
}

/**
 * The "major node" overlay: instanced planet spheres and rings, optional per-node image
 * sprites, and floating node labels. Recomputes instance transforms/colors from the current
 * selection, hover, and active group on every update.
 */
export function createPlanetOverlay<NMeta = unknown, EMeta = unknown>(
  deps: PlanetOverlayDeps<NMeta, EMeta>,
): PlanetOverlay {
  const {
    world,
    labelsRoot,
    labels,
    renderer,
    nodePositions,
    edgeEndpoints,
    accessors,
    theme,
    activeGroup,
    planetSizing,
    selection,
    nodeSizing,
  } = deps;

  const planetTexture = makePlanetTexture();
  const planetGeometry = new THREE.SphereGeometry(1, 36, 24);
  const planetMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: planetTexture,
    transparent: true,
    opacity: theme().scene.planetOpacity,
    blending: themeBlending(theme().scene.planetBlending),
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
    opacity: theme().scene.ringOpacity,
    side: THREE.DoubleSide,
    blending: themeBlending(theme().scene.planetBlending),
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
    const imageUrl = accessors().nodeImage(node);
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

  function update() {
    const resolved = accessors();
    const currentTheme = theme();
    const group = activeGroup();
    const { selectedNodeId, selectedEdgeId, selectedNodeHighlight, hoveredNodeId } = selection;
    const projection = selection.visibility;
    const majorNodes = nodeSizing
      .selectPlanetOverlayNodes()
      .filter(
        (node) =>
          !projection ||
          projection.visibleNodeIds.has(node.id) ||
          selectedNodeId === node.id ||
          selection.pathNodeIds?.has(node.id),
      );
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    const selectedEndpoints = selectedEdgeId ? (edgeEndpoints.get(selectedEdgeId) ?? null) : null;
    const maxDegree = nodeSizing.maxDegreeForMode(planetSizing().mode);
    planetInstanceNodeIds.length = 0;
    planetMesh.count = majorNodes.length;
    let ringIndex = 0;

    majorNodes.forEach((node, index) => {
      const position = nodePositions.get(node.id)!;
      const nodeSize = resolved.nodeSize(node);
      const nodeColor =
        currentTheme.dataColorStrategy === 'theme' ? currentTheme.scene.pointColor : resolved.nodeColor(node);
      const radius = nodeSizing.planetRadius(node, maxDegree);
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
        ? selected
          ? new THREE.Color(currentTheme.scene.pointSelectedColor)
          : planetColor(nodeColor).multiplyScalar(relatedToSelectedEdge || firstDegree ? 1.2 : 1.1)
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

      if (resolved.nodeRing(node)) {
        instanceDummy.position.set(position.x, position.y, position.z);
        instanceDummy.rotation.set(RING_TILT_X, RING_TILT_Y, Math.PI * ((index % PLANET_YAW_CYCLE) / PLANET_YAW_CYCLE));
        instanceDummy.scale.setScalar(ringScale);
        instanceDummy.updateMatrix();
        ringMesh.setMatrixAt(ringIndex, instanceDummy.matrix);
        ringMesh.setColorAt(ringIndex, emphasized ? new THREE.Color(currentTheme.scene.pointSelectedColor) : color);
        ringIndex += 1;
      }

      planetInstanceNodeIds[index] = node.id;

      const label = nodeLabelPool[index];
      const labelAllowed = projection ? projection.labelNodeIds.has(node.id) : shouldShowMajorLabel(index, group);
      const labelText = !emphasized && labelAllowed ? resolved.nodeLabel(node) : null;
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

  function dispose() {
    planetTexture.dispose();
    nodeImageTextures.forEach((texture) => texture.dispose());
    nodeImageTextures.clear();
  }

  function setTheme() {
    const currentTheme = theme();
    planetMaterial.opacity = currentTheme.scene.planetOpacity;
    ringMaterial.opacity = currentTheme.scene.ringOpacity;
    setMaterialBlending(planetMaterial, currentTheme.scene.planetBlending);
    setMaterialBlending(ringMaterial, currentTheme.scene.planetBlending);
    update();
  }

  return {
    mesh: planetMesh,
    nodeIdAt: (instanceId: number) => planetInstanceNodeIds[instanceId],
    update,
    setTheme,
    dispose,
  };
}
