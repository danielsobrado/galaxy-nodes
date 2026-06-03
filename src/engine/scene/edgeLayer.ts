import * as THREE from 'three';
import { getEdgeId } from '../../domain/data';
import type { GraphEdge, GraphNode, ResolvedAccessors, Vec3 } from '../../domain/types';
import { createEdgeLineGeometry, createTubeGeometry, getEdgeSpec } from '../edges';
import type { EdgeRenderMode, GalaxyGraphTheme } from '../rendererConfig';
import { HOVER_EDGE_OVERLAY_OPACITY, HOVER_EDGE_RADIUS_FACTOR } from '../sceneConstants';
import { edgeMatchesActiveGroup } from '../sceneData';
import type { EdgeEndpoints, EdgeVisualState, SceneEdgeEndpoint } from '../sceneTypes';
import { resolveEndpoint } from './endpoints';
import type { SelectionState } from './sceneContext';

export interface EdgeLayerDeps<NMeta = unknown, EMeta = unknown> {
  world: THREE.Object3D;
  edgeRenderMode: EdgeRenderMode;
  edgeLookup: Map<string, GraphEdge<EMeta>>;
  edgeEndpoints: Map<string, EdgeEndpoints>;
  edgeStates: Map<string, EdgeVisualState<EMeta>>;
  pickTargets: THREE.Object3D[];
  nodeLookup: Map<string, GraphNode<NMeta>>;
  nodePositions: Map<string, Vec3>;
  clusterLookup: Map<string, SceneEdgeEndpoint>;
  accessors: () => ResolvedAccessors<NMeta, EMeta>;
  activeGroup: () => string | null;
  galaxyMode: () => boolean;
  theme: () => GalaxyGraphTheme | undefined;
  planetRadius: (node: GraphNode<NMeta>) => number;
  selection: () => SelectionState;
  indexSelectableEdge: (edgeId: string, edge: GraphEdge<EMeta>) => void;
}

export interface EdgeLayer<EMeta = unknown> {
  addEdge(edge: GraphEdge<EMeta>, index: number): void;
  update(): void;
  updateVisibility(): void;
  applyAppearance(): void;
}

export function createEdgeLayer<NMeta = unknown, EMeta = unknown>(deps: EdgeLayerDeps<NMeta, EMeta>): EdgeLayer<EMeta> {
  const {
    world,
    edgeRenderMode,
    edgeLookup,
    edgeEndpoints,
    edgeStates,
    pickTargets,
    nodeLookup,
    nodePositions,
    clusterLookup,
    accessors,
    activeGroup,
    galaxyMode,
    theme,
    planetRadius,
    selection,
    indexSelectableEdge,
  } = deps;

  const hoverEdgeEmptyGeometry = new THREE.BufferGeometry();
  const hoverEdgeMaterial = new THREE.MeshBasicMaterial({
    color: theme()?.panelAccentColor ?? '#46f4bc',
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

  function currentAccessors() {
    return accessors() as ResolvedAccessors<unknown, EMeta>;
  }

  function resolveNodeEndpoint(id: string) {
    return resolveEndpoint(id, nodeLookup, nodePositions, clusterLookup, accessors(), planetRadius);
  }

  function edgeVisualGeometry(spec: ReturnType<typeof getEdgeSpec>) {
    return edgeRenderMode === 'line'
      ? createEdgeLineGeometry(spec.curve, spec.visualSegments)
      : createTubeGeometry(spec.curve, spec.visualSegments, spec.radius);
  }

  function edgeVisualMaterial(spec: ReturnType<typeof getEdgeSpec>) {
    const materialOptions = {
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    };
    return edgeRenderMode === 'line'
      ? new THREE.LineBasicMaterial(materialOptions)
      : new THREE.MeshBasicMaterial(materialOptions);
  }

  function edgeVisualObject(spec: ReturnType<typeof getEdgeSpec>) {
    return edgeRenderMode === 'line'
      ? new THREE.LineSegments(edgeVisualGeometry(spec), edgeVisualMaterial(spec))
      : new THREE.Mesh(edgeVisualGeometry(spec), edgeVisualMaterial(spec));
  }

  function refreshEdgeGeometry(state: EdgeVisualState<EMeta>) {
    const source = resolveNodeEndpoint(state.edge.source);
    const target = resolveNodeEndpoint(state.edge.target);
    if (!source || !target) {
      state.visible = false;
      if (state.hit) state.hit.userData.pickable = false;
      state.visual.visible = false;
      edgeEndpoints.delete(state.id);
      return;
    }

    state.endpoints = { source, target };
    edgeEndpoints.set(state.id, state.endpoints);
    const spec = getEdgeSpec(state.edge, state.endpoints, currentAccessors(), galaxyMode());
    const appearanceKey = `${spec.color}:${spec.opacity.toFixed(4)}`;
    if (state.geometryKey !== spec.geometryKey || state.appearanceKey !== appearanceKey) {
      const visual = state.visual as THREE.Mesh | THREE.LineSegments;
      visual.geometry.dispose();
      visual.geometry = edgeVisualGeometry(spec);
      const material = visual.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
      material.color.set(spec.color);
      material.opacity = spec.opacity;
      visual.userData.baseOpacity = spec.opacity;
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

  function edgeVisibleInSelectionContext(edgeId: string) {
    const { selectedNodeHighlight, selectedEdgeHighlight } = selection();
    return Boolean(
      selectedNodeHighlight?.connectedEdgeIds.has(edgeId) || selectedEdgeHighlight?.connectedEdgeIds.has(edgeId),
    );
  }

  function updateVisibility() {
    const selected = selection().selectedEdgeId;
    edgeStates.forEach((state) => {
      const visibleByGroup = edgeMatchesActiveGroup(
        state.endpoints.source.group,
        state.endpoints.target.group,
        activeGroup(),
      );
      const visible = visibleByGroup || selected === state.id || edgeVisibleInSelectionContext(state.id);
      state.visible = visible;
      state.visual.visible = visible;
      if (state.hit) state.hit.userData.pickable = visible;
    });
  }

  function updateHoverEdgeOverlay() {
    const { hoveredEdgeId } = selection();
    const state = hoveredEdgeId ? (edgeStates.get(hoveredEdgeId) ?? null) : null;
    hoverEdgeMaterial.color.set(theme()?.panelAccentColor ?? '#46f4bc');

    if (!state || !state.visual.visible || edgeRenderMode !== 'tube') {
      hoverEdgeOverlay.visible = false;
      return;
    }

    const spec = getEdgeSpec(state.edge, state.endpoints, currentAccessors(), galaxyMode());
    const nextKey = `${state.id}:${spec.geometryKey}`;
    if (hoverEdgeOverlayKey !== nextKey) {
      hoverEdgeOverlayGeometry?.dispose();
      hoverEdgeOverlayGeometry = createTubeGeometry(
        spec.curve,
        spec.visualSegments,
        spec.radius * HOVER_EDGE_RADIUS_FACTOR,
      );
      hoverEdgeOverlay.geometry = hoverEdgeOverlayGeometry;
      hoverEdgeOverlayKey = nextKey;
    }

    hoverEdgeOverlay.visible = true;
  }

  function applyAppearance() {
    const { selectedNodeId, selectedEdgeId, selectedNodeHighlight, selectedEdgeHighlight, hoveredEdgeId } = selection();
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
    edgeStates.forEach((state) => {
      const visual = state.visual as THREE.Mesh | THREE.LineSegments;
      const material = visual.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
      const baseOpacity = Number(visual.userData.baseOpacity ?? state.baseOpacity ?? 0.18);
      const selected = selectedEdgeId === state.id;
      const connectedToSelection = Boolean(
        selectedNodeHighlight?.connectedEdgeIds.has(state.id) || selectedEdgeHighlight?.connectedEdgeIds.has(state.id),
      );
      const hovered = hoveredEdgeId === state.id;
      material.opacity = selected
        ? Math.min(0.86, baseOpacity + 0.56)
        : hovered
          ? Math.min(0.54, baseOpacity + 0.26)
          : connectedToSelection
            ? Math.min(0.82, baseOpacity + 0.52)
            : hasSelection
              ? baseOpacity * 0.28
              : baseOpacity;
      material.depthTest = !(selected || connectedToSelection || hovered);
      material.color.set(
        selected ? '#ffffff' : hovered ? (theme()?.panelAccentColor ?? '#46f4bc') : accessors().edgeColor(state.edge),
      );
      visual.renderOrder = selected ? 18 : hovered ? 17 : connectedToSelection ? 16 : 0;
      visual.scale.setScalar(1);
    });
    updateHoverEdgeOverlay();
  }

  function update() {
    edgeStates.forEach((state) => refreshEdgeGeometry(state));
    updateVisibility();
    applyAppearance();
  }

  function addEdge(edge: GraphEdge<EMeta>, index: number) {
    const source = resolveNodeEndpoint(edge.source);
    const target = resolveNodeEndpoint(edge.target);
    if (!source || !target) return;

    const edgeId = getEdgeId(edge, index);
    const endpoints = { source, target };
    const spec = getEdgeSpec(edge, endpoints, currentAccessors(), galaxyMode());
    const visual = edgeVisualObject(spec);
    visual.userData.edgeId = edgeId;
    visual.userData.type = 'edge-visual';
    visual.userData.baseOpacity = spec.opacity;
    visual.frustumCulled = false;
    world.add(visual);

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
      hit.visible = false;
      pickTargets.push(hit);
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
      visual,
      visible: true,
    };
    edgeStates.set(edgeId, state);
    edgeLookup.set(edgeId, edge);
    edgeEndpoints.set(edgeId, endpoints);
    indexSelectableEdge(edgeId, edge);
  }

  return {
    addEdge,
    update,
    updateVisibility,
    applyAppearance,
  };
}
