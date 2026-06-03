import * as THREE from 'three';
import type { GraphNode, ResolvedAccessors } from '../../domain/types';
import type { ResolvedGalaxyGraphTheme } from '../rendererConfig';
import {
  ENDPOINT_INNER_RING_SPIN,
  ENDPOINT_MARKER_SCALE_PRIMARY,
  ENDPOINT_MARKER_SCALE_SECONDARY,
  ENDPOINT_OUTER_RING_SPIN,
  ENDPOINT_RING_SPIN_STAGGER,
  HIGHLIGHT_INNER_RING_SPIN,
  HIGHLIGHT_MARKER_SCALE_FAR,
  HIGHLIGHT_MARKER_SCALE_NEAR,
  HIGHLIGHT_MARKER_STRENGTH_FAR,
  HIGHLIGHT_MARKER_STRENGTH_NEAR,
  HIGHLIGHT_OUTER_RING_SPIN,
  HIGHLIGHT_RING_SPIN_STAGGER,
  HOVER_BALL_SPIN,
  NODE_HIGHLIGHT_FIRST_DEGREE_LIMIT,
  NODE_HIGHLIGHT_MARKER_LIMIT,
  NODE_HIGHLIGHT_SECOND_DEGREE_LIMIT,
  NODE_MARKER_LABEL_MIN_X,
  NODE_MARKER_LABEL_MIN_Y,
  NODE_MARKER_LABEL_OFFSET_X,
  NODE_MARKER_LABEL_OFFSET_Y,
} from '../sceneConstants';
import {
  createEndpointMarker,
  createHoverNodeMarker,
  setHoverNodeMarkerBlending,
  setHoverNodeMarkerVisible,
  setMarkerBlending,
  setMarkerVisible,
} from '../markers';
import { makeSceneLabel, nodeDisplayLabel, setSceneLabel } from '../labels';
import type { EdgeEndpoints, EndpointMarker, SceneEdgeEndpoint, SceneLabel } from '../sceneTypes';
import type { NodeSelectionHighlight } from './sceneContext';

interface NodeHighlightMarker {
  label: SceneLabel;
  marker: EndpointMarker;
}

export interface SelectionMarkerInput {
  primaryEndpoint: SceneEdgeEndpoint | null;
  secondaryEndpoint: SceneEdgeEndpoint | null;
  selectedNodeEndpoint: SceneEdgeEndpoint | null;
  selectedNodeId: string | null;
  selectedEndpoints: EdgeEndpoints | null;
  selectedNodeHighlight: NodeSelectionHighlight | null;
}

export interface MarkerLayerDeps<NMeta = unknown, EMeta = unknown> {
  world: THREE.Object3D;
  labelsRoot: HTMLDivElement;
  /** Shared label pool projected by the animation loop; marker labels are appended to it. */
  labels: SceneLabel[];
  theme: () => ResolvedGalaxyGraphTheme;
  accessors: () => ResolvedAccessors<NMeta, EMeta>;
  nodeLookup: Map<string, GraphNode<NMeta>>;
  resolveEndpoint: (id: string) => SceneEdgeEndpoint | null;
  rankedHighlightNodeIds: (ids: Iterable<string>, limit: number) => string[];
  setBloomLayer: (object: THREE.Object3D, enabled: boolean) => void;
}

export interface MarkerLayer {
  /** Position/colour the two endpoint markers and the first/second-degree node markers. */
  updateSelectionMarkers(input: SelectionMarkerInput): void;
  /** Position/colour the hover marker for the currently hovered node endpoint. */
  updateHoverMarker(hoveredEndpoint: SceneEdgeEndpoint | null): void;
  /** Advance the ring/ball spin animation for any visible markers. */
  spin(): void;
  /** Whether any marker is visible (drives whether the bloom pass needs to run). */
  anyVisible(): boolean;
  setTheme(): void;
}

/**
 * Selection/hover marker overlays: the two endpoint markers for a selected node/edge, the
 * ranked first/second-degree node markers, and the hover marker, plus their floating labels.
 * Owns all marker objects and toggles their bloom-layer membership as they appear/disappear.
 */
export function createMarkerLayer<NMeta = unknown, EMeta = unknown>(deps: MarkerLayerDeps<NMeta, EMeta>): MarkerLayer {
  const {
    world,
    labelsRoot,
    labels,
    theme,
    accessors,
    nodeLookup,
    resolveEndpoint,
    rankedHighlightNodeIds,
    setBloomLayer,
  } = deps;

  const endpointMarkers: [EndpointMarker, EndpointMarker] = [
    createEndpointMarker(theme().selectedColor, theme().scene.markerBlending),
    createEndpointMarker(theme().panelAccentColor, theme().scene.markerBlending),
  ];
  endpointMarkers.forEach((marker) => world.add(marker.group));
  const hoverNodeMarker = createHoverNodeMarker(theme().selectedColor, theme().scene.markerBlending);
  world.add(hoverNodeMarker.group);
  const endpointMarkerLabels: [SceneLabel, SceneLabel] = [
    makeSceneLabel(labelsRoot, 'node-highlight-label'),
    makeSceneLabel(labelsRoot, 'node-highlight-label'),
  ];
  endpointMarkerLabels.forEach((label) => labels.push(label));
  const nodeHighlightMarkers: NodeHighlightMarker[] = Array.from({ length: NODE_HIGHLIGHT_MARKER_LIMIT }, () => {
    const marker = createEndpointMarker(theme().panelAccentColor, theme().scene.markerBlending);
    const label = makeSceneLabel(labelsRoot, 'node-highlight-label subtle');
    labels.push(label);
    world.add(marker.group);
    return { label, marker };
  });

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
    const labelText = node ? nodeDisplayLabel(node, accessors()) : null;
    setSceneLabel(label, labelText, labelText && endpoint ? nodeMarkerLabelPosition(endpoint) : null);
  }

  function endpointNodeColor(endpoint: SceneEdgeEndpoint | null, fallback: string) {
    if (!endpoint?.isNode) return fallback;
    if (theme().dataColorStrategy === 'theme') return fallback;
    const node = nodeLookup.get(endpoint.id);
    return node ? accessors().nodeColor(node) : fallback;
  }

  function setNodeHighlightMarker(entry: NodeHighlightMarker, nodeId: string, level: 1 | 2) {
    const endpoint = resolveEndpoint(nodeId);
    const node = nodeLookup.get(nodeId) ?? null;
    const labelText = node ? nodeDisplayLabel(node, accessors()) : null;
    const currentTheme = theme();
    const color =
      node && currentTheme.dataColorStrategy === 'data'
        ? accessors().nodeColor(node)
        : level === 2
          ? currentTheme.scene.pointFirstDegreeColor
          : currentTheme.scene.pointSecondDegreeColor;
    setMarkerVisible(
      entry.marker,
      endpoint,
      color,
      level === 2 ? HIGHLIGHT_MARKER_SCALE_NEAR : HIGHLIGHT_MARKER_SCALE_FAR,
      level === 2 ? HIGHLIGHT_MARKER_STRENGTH_NEAR : HIGHLIGHT_MARKER_STRENGTH_FAR,
      currentTheme.scene.markerOpacityScale,
    );
    setBloomLayer(entry.marker.group, Boolean(endpoint));
    setSceneLabel(entry.label, labelText, labelText && endpoint ? nodeMarkerLabelPosition(endpoint) : null);
    entry.label.element.classList.toggle('subtle', level === 1);
  }

  function updateNodeHighlightMarkers(selectedNodeHighlight: NodeSelectionHighlight | null) {
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
        setMarkerVisible(entry.marker, null, theme().panelAccentColor, 1);
        setBloomLayer(entry.marker.group, false);
        setSceneLabel(entry.label, null, null);
        return;
      }

      setNodeHighlightMarker(entry, highlightedNode.nodeId, highlightedNode.level);
    });
  }

  function updateSelectionMarkers(input: SelectionMarkerInput) {
    const { primaryEndpoint, secondaryEndpoint, selectedNodeEndpoint, selectedNodeId, selectedEndpoints } = input;
    setMarkerVisible(
      endpointMarkers[0],
      primaryEndpoint,
      selectedNodeEndpoint
        ? theme().scene.pointSelectedColor
        : endpointNodeColor(primaryEndpoint, theme().scene.pointSelectedColor),
      selectedNodeEndpoint || selectedEndpoints?.source.id === selectedNodeId
        ? ENDPOINT_MARKER_SCALE_PRIMARY
        : ENDPOINT_MARKER_SCALE_SECONDARY,
      1,
      theme().scene.markerOpacityScale,
    );
    setBloomLayer(endpointMarkers[0].group, Boolean(primaryEndpoint));
    setMarkerVisible(
      endpointMarkers[1],
      secondaryEndpoint,
      endpointNodeColor(secondaryEndpoint, theme().panelAccentColor),
      selectedEndpoints?.target.id === selectedNodeId ? ENDPOINT_MARKER_SCALE_PRIMARY : ENDPOINT_MARKER_SCALE_SECONDARY,
      1,
      theme().scene.markerOpacityScale,
    );
    setBloomLayer(endpointMarkers[1].group, Boolean(secondaryEndpoint));
    setEndpointMarkerLabel(endpointMarkerLabels[0], primaryEndpoint);
    setEndpointMarkerLabel(endpointMarkerLabels[1], secondaryEndpoint);
    updateNodeHighlightMarkers(input.selectedNodeHighlight);
  }

  function updateHoverMarker(hoveredEndpoint: SceneEdgeEndpoint | null) {
    setHoverNodeMarkerVisible(
      hoverNodeMarker,
      hoveredEndpoint,
      endpointNodeColor(hoveredEndpoint, theme().panelAccentColor),
    );
    setBloomLayer(hoverNodeMarker.group, Boolean(hoveredEndpoint));
  }

  function spin() {
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

  function anyVisible() {
    return (
      hoverNodeMarker.group.visible ||
      endpointMarkers.some((marker) => marker.group.visible) ||
      nodeHighlightMarkers.some(({ marker }) => marker.group.visible)
    );
  }

  function setTheme() {
    const currentTheme = theme();
    endpointMarkers.forEach((marker) => setMarkerBlending(marker, currentTheme.scene.markerBlending));
    nodeHighlightMarkers.forEach(({ marker }) => setMarkerBlending(marker, currentTheme.scene.markerBlending));
    setHoverNodeMarkerBlending(hoverNodeMarker, currentTheme.scene.markerBlending);
  }

  return { updateSelectionMarkers, updateHoverMarker, spin, anyVisible, setTheme };
}
