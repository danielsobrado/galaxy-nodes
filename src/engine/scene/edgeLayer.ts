import * as THREE from 'three';
import { getEdgeId } from '../../domain/data';
import type { GraphEdge, GraphNode, ResolvedAccessors, Vec3 } from '../../domain/types';
import { createEdgeLineGeometry, createTubeGeometry, getEdgeSpec } from '../edges';
import type { EdgeRenderMode, ResolvedGalaxyGraphTheme } from '../rendererConfig';
import {
  EDGE_CONNECTED_OPACITY_BOOST,
  EDGE_CONNECTED_OPACITY_CAP,
  EDGE_HOVERED_OPACITY_BOOST,
  EDGE_HOVERED_OPACITY_CAP,
  EDGE_RENDER_ORDER_BASE,
  EDGE_RENDER_ORDER_CONNECTED,
  EDGE_RENDER_ORDER_HOVERED,
  EDGE_RENDER_ORDER_SELECTED,
  EDGE_SELECTED_OPACITY_BOOST,
  EDGE_SELECTED_OPACITY_CAP,
  EDGE_UNRELATED_DIM,
  HOVER_EDGE_OVERLAY_RENDER_ORDER,
  HOVER_EDGE_RADIUS_FACTOR,
} from '../sceneConstants';
import { edgeMatchesActiveGroup } from '../sceneData';
import type { EdgeEndpoints, EdgeVisualState, SceneEdgeEndpoint } from '../sceneTypes';
import { resolveEndpoint } from './endpoints';
import type { SelectionState } from './sceneContext';
import { setMaterialBlending, themeBlending } from './themeRuntime';

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
  theme: () => ResolvedGalaxyGraphTheme;
  planetRadius: (node: GraphNode<NMeta>) => number;
  /** Live selection record, read by reference (mutated in place by the orchestrator). */
  selection: SelectionState;
  indexSelectableEdge: (edgeId: string, edge: GraphEdge<EMeta>) => void;
}

export interface EdgeLayer<EMeta = unknown> {
  addEdge(edge: GraphEdge<EMeta>, index: number): void;
  visibleCount(): number;
  update(): void;
  updateVisibility(): void;
  applyAppearance(): void;
  setTheme(): void;
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
    color: theme().scene.edgeHoverColor,
    transparent: true,
    opacity: theme().scene.hoverEdgeOpacity,
    blending: themeBlending(theme().scene.edgeBlending),
    depthWrite: false,
    depthTest: false,
  });
  const hoverEdgeOverlay = new THREE.Mesh(hoverEdgeEmptyGeometry, hoverEdgeMaterial);
  hoverEdgeOverlay.renderOrder = HOVER_EDGE_OVERLAY_RENDER_ORDER;
  hoverEdgeOverlay.visible = false;
  world.add(hoverEdgeOverlay);
  let hoverEdgeOverlayGeometry: THREE.BufferGeometry | null = null;
  let hoverEdgeOverlayKey: string | null = null;

  function currentAccessors() {
    return accessors() as ResolvedAccessors<unknown, EMeta>;
  }

  function themedEdgeColor(edge: GraphEdge<EMeta>, fallback: string) {
    const currentTheme = theme();
    if (currentTheme.dataColorStrategy === 'data') return fallback;
    return edge.kind === 'filament' ? currentTheme.scene.filamentColor : currentTheme.scene.edgeColor;
  }

  function themedEdgeOpacity(opacity: number) {
    return Math.max(0, Math.min(1, opacity * theme().scene.edgeOpacityMultiplier));
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
      blending: themeBlending(theme().scene.edgeBlending),
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
    const baseColor = themedEdgeColor(state.edge, spec.color);
    const baseOpacity = themedEdgeOpacity(spec.opacity);
    const appearanceKey = `${baseColor}:${baseOpacity.toFixed(4)}:${theme().scene.edgeBlending}`;
    if (state.geometryKey !== spec.geometryKey || state.appearanceKey !== appearanceKey) {
      const visual = state.visual as THREE.Mesh | THREE.LineSegments;
      visual.geometry.dispose();
      visual.geometry = edgeVisualGeometry(spec);
      const material = visual.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
      material.color.set(baseColor);
      material.opacity = baseOpacity;
      setMaterialBlending(material, theme().scene.edgeBlending);
      visual.userData.baseOpacity = baseOpacity;
      if (state.hit) {
        state.hit.geometry.dispose();
        state.hit.geometry = createTubeGeometry(spec.curve, spec.hitSegments, spec.hitRadius);
      }
      state.geometryKey = spec.geometryKey;
      state.appearanceKey = appearanceKey;
      state.baseOpacity = baseOpacity;
    }

    if (state.hit) (state.hit.material as THREE.MeshBasicMaterial).color.set(baseColor);
  }

  function edgeVisibleInSelectionContext(edgeId: string) {
    const { selectedNodeHighlight, selectedEdgeHighlight } = selection;
    return Boolean(
      selectedNodeHighlight?.connectedEdgeIds.has(edgeId) || selectedEdgeHighlight?.connectedEdgeIds.has(edgeId),
    );
  }

  function updateVisibility() {
    const selected = selection.selectedEdgeId;
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
    const { hoveredEdgeId } = selection;
    const state = hoveredEdgeId ? (edgeStates.get(hoveredEdgeId) ?? null) : null;
    hoverEdgeMaterial.color.set(theme().scene.edgeHoverColor);
    hoverEdgeMaterial.opacity = theme().scene.hoverEdgeOpacity;
    setMaterialBlending(hoverEdgeMaterial, theme().scene.edgeBlending);

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
    const { selectedNodeId, selectedEdgeId, selectedNodeHighlight, selectedEdgeHighlight, hoveredEdgeId } = selection;
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
        ? Math.min(EDGE_SELECTED_OPACITY_CAP, baseOpacity + EDGE_SELECTED_OPACITY_BOOST)
        : hovered
          ? Math.min(EDGE_HOVERED_OPACITY_CAP, baseOpacity + EDGE_HOVERED_OPACITY_BOOST)
          : connectedToSelection
            ? Math.min(EDGE_CONNECTED_OPACITY_CAP, baseOpacity + EDGE_CONNECTED_OPACITY_BOOST)
            : hasSelection
              ? baseOpacity * EDGE_UNRELATED_DIM
              : baseOpacity;
      material.depthTest = !(selected || connectedToSelection || hovered);
      material.color.set(
        selected
          ? theme().scene.edgeSelectedColor
          : hovered
            ? theme().scene.edgeHoverColor
            : connectedToSelection && theme().dataColorStrategy === 'theme'
              ? theme().scene.edgeConnectedColor
              : themedEdgeColor(state.edge, accessors().edgeColor(state.edge)),
      );
      setMaterialBlending(material, theme().scene.edgeBlending);
      visual.renderOrder = selected
        ? EDGE_RENDER_ORDER_SELECTED
        : hovered
          ? EDGE_RENDER_ORDER_HOVERED
          : connectedToSelection
            ? EDGE_RENDER_ORDER_CONNECTED
            : EDGE_RENDER_ORDER_BASE;
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
    const baseColor = themedEdgeColor(edge, spec.color);
    const baseOpacity = themedEdgeOpacity(spec.opacity);
    const visual = edgeVisualObject(spec);
    const visualMaterial = visual.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
    visualMaterial.color.set(baseColor);
    visualMaterial.opacity = baseOpacity;
    visual.userData.edgeId = edgeId;
    visual.userData.type = 'edge-visual';
    visual.userData.baseOpacity = baseOpacity;
    visual.frustumCulled = false;
    world.add(visual);

    // Quality mode keeps a per-edge invisible hit tube for raycast picking. Scale (line)
    // mode skips it: at 100k+ edges that is 100k+ Object3Ds plus an O(N) array spread and
    // raycast on every pointermove. Edge highlighting still works there via node selection
    // (connectedEdgeIds updates per-edge material opacity); only direct edge-click picking
    // is unavailable.
    let hit: THREE.Mesh | null = null;
    if (edgeRenderMode === 'tube') {
      hit = new THREE.Mesh(
        createTubeGeometry(spec.curve, spec.hitSegments, spec.hitRadius),
        new THREE.MeshBasicMaterial({
          color: baseColor,
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
      // Keeping it invisible removes one draw call per edge while it stays pickable;
      // eligibility is gated by userData.pickable instead.
      hit.visible = false;
      pickTargets.push(hit);
      world.add(hit);
    }

    const state = {
      appearanceKey: `${baseColor}:${baseOpacity.toFixed(4)}:${theme().scene.edgeBlending}`,
      baseOpacity,
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
    visibleCount: () => Array.from(edgeStates.values()).reduce((count, state) => count + (state.visible ? 1 : 0), 0),
    update,
    updateVisibility,
    applyAppearance,
    setTheme: update,
  };
}
