import * as THREE from 'three';
import type { GraphNode, ResolvedAccessors, Vec3 } from '../../domain/types';
import {
  DIMMED_POINT_COLOR_FACTOR,
  POINT_BASE_SIZE_DEFAULT,
  POINT_BASE_SIZE_GALAXY,
  POINT_MIN_PIXEL_SIZE,
  POINT_SIZE_FIRST_DEGREE,
  POINT_SIZE_SECOND_DEGREE,
  POINT_SIZE_SELECTED,
  POINT_UNRELATED_DIM,
  SELECTION_POINT_OPACITY,
} from '../sceneConstants';
import { pointCloudColor } from '../materials';
import { createPointCloudMaterial } from '../pointCloudMaterial';
import { PointCloudBuffer } from '../pointCloudBuffer';
import { resolveDensityScale } from '../rendererConfig';
import type { GraphDataset } from '../../domain/types';
import type { EdgeEndpoints } from '../sceneTypes';
import type { SelectionState } from './sceneContext';

const tmpPointSelectionColor = new THREE.Color();

export interface PointLayerDeps<NMeta = unknown, EMeta = unknown> {
  world: THREE.Object3D;
  nodes: () => GraphNode<NMeta>[];
  nodePositions: Map<string, Vec3>;
  accessors: () => ResolvedAccessors<NMeta, EMeta>;
  activeGroup: () => string | null;
  selection: () => SelectionState;
  edgeEndpoints: Map<string, EdgeEndpoints>;
  galaxyMode: boolean;
  nodeSizeScale: number;
  pixelRatio: number;
}

export interface PointLayer<NMeta = unknown> {
  /** The Points object, used as a raycast target. */
  readonly object: THREE.Points;
  /** Per-node rendered size; 0 means hidden (used by picking to reject invisible points). */
  visibleSizeAt(index: number): number;
  /** Recompute base colors/sizes from accessors, then refresh visibility. */
  updateAppearance(): void;
  /** Recompute per-node highlight color/size from the current selection + active group. */
  updateVisibility(): void;
  /** Extend the buffer for appended nodes and refresh the adaptive density scale. */
  grow<E>(prevCount: number, dataset: GraphDataset<NMeta, E>): void;
  setFocus(focusActive: boolean, focusPosition: THREE.Vector3 | null): void;
  resetPulse(): void;
  setPulseTime(time: number): void;
  setGlobalOpacity(hasSelection: boolean): void;
  setGalaxyMode(galaxyMode: boolean): void;
  setNodeSizeScale(scale: number): void;
  setPixelRatio(pixelRatio: number): void;
}

/**
 * The node point cloud: the GPU buffer of per-node colors/sizes, its shader material, and
 * the highlight/visibility math that reacts to selection and the active group. Owns every
 * point-material uniform; the orchestrator drives it through named setters.
 */
export function createPointLayer<NMeta = unknown, EMeta = unknown>(
  deps: PointLayerDeps<NMeta, EMeta>,
): PointLayer<NMeta> {
  const { world, nodes, nodePositions, accessors, activeGroup, selection, edgeEndpoints } = deps;

  const pointBuffer = new PointCloudBuffer(nodes(), nodePositions);
  const pointsMaterial = createPointCloudMaterial({
    galaxyMode: deps.galaxyMode,
    nodeSizeScale: deps.nodeSizeScale,
    nodeCount: nodes().length,
    pixelRatio: deps.pixelRatio,
  });
  const pointCloud = new THREE.Points(pointBuffer.geometry, pointsMaterial);
  pointCloud.userData.type = 'node-points';
  world.add(pointCloud);

  function updateVisibility() {
    const { selectedNodeId, selectedEdgeId, selectedNodeHighlight, selectedEdgeHighlight } = selection();
    const group = activeGroup();
    const selectedEndpointNodeIds = new Set<string>();
    const selectedEndpoints = selectedEdgeId ? (edgeEndpoints.get(selectedEdgeId) ?? null) : null;
    if (selectedEndpoints?.source.isNode) selectedEndpointNodeIds.add(selectedEndpoints.source.id);
    if (selectedEndpoints?.target.isNode) selectedEndpointNodeIds.add(selectedEndpoints.target.id);

    pointBuffer.visibleSizes.fill(0);
    nodes().forEach((node, index) => {
      const baseColorOffset = index * 3;
      const selected = selectedNodeId === node.id;
      const firstDegree =
        selectedEndpointNodeIds.has(node.id) ||
        Boolean(selectedNodeHighlight?.firstDegreeNodeIds.has(node.id)) ||
        Boolean(selectedEdgeHighlight?.firstDegreeNodeIds.has(node.id));
      const secondDegree =
        Boolean(selectedNodeHighlight?.secondDegreeNodeIds.has(node.id)) ||
        Boolean(selectedEdgeHighlight?.secondDegreeNodeIds.has(node.id));
      const highlightLevel = selected ? 3 : firstDegree ? 2 : secondDegree ? 1 : 0;
      const visibleByGroup = group === null || node.group === group;

      if (!visibleByGroup && highlightLevel === 0) {
        pointBuffer.colors[baseColorOffset] = pointBuffer.baseColors[baseColorOffset] * DIMMED_POINT_COLOR_FACTOR;
        pointBuffer.colors[baseColorOffset + 1] =
          pointBuffer.baseColors[baseColorOffset + 1] * DIMMED_POINT_COLOR_FACTOR;
        pointBuffer.colors[baseColorOffset + 2] =
          pointBuffer.baseColors[baseColorOffset + 2] * DIMMED_POINT_COLOR_FACTOR;
        return;
      }

      const baseSize = pointBuffer.baseSizes[index];
      const sizeMultiplier =
        highlightLevel === 3
          ? POINT_SIZE_SELECTED
          : highlightLevel === 2
            ? POINT_SIZE_FIRST_DEGREE
            : highlightLevel === 1
              ? POINT_SIZE_SECOND_DEGREE
              : 1;
      pointBuffer.visibleSizes[index] =
        visibleByGroup || highlightLevel > 0 ? Math.max(baseSize * sizeMultiplier, baseSize + highlightLevel) : 0;

      tmpPointSelectionColor.setRGB(
        pointBuffer.baseColors[baseColorOffset],
        pointBuffer.baseColors[baseColorOffset + 1],
        pointBuffer.baseColors[baseColorOffset + 2],
      );

      if (highlightLevel === 3) tmpPointSelectionColor.set('#ffffff');
      else if (highlightLevel === 2) tmpPointSelectionColor.multiplyScalar(1.36);
      else if (highlightLevel === 1) tmpPointSelectionColor.multiplyScalar(1.18);
      else if (selectedNodeId || selectedEdgeId) tmpPointSelectionColor.multiplyScalar(POINT_UNRELATED_DIM);

      pointBuffer.colors[baseColorOffset] = tmpPointSelectionColor.r;
      pointBuffer.colors[baseColorOffset + 1] = tmpPointSelectionColor.g;
      pointBuffer.colors[baseColorOffset + 2] = tmpPointSelectionColor.b;
    });
    pointBuffer.markAppearanceUpdated();
  }

  function updateAppearance() {
    const resolved = accessors();
    nodes().forEach((node, index) => {
      const pointColor = pointCloudColor(resolved.nodeColor(node));
      pointBuffer.baseColors[index * 3] = pointColor.r;
      pointBuffer.baseColors[index * 3 + 1] = pointColor.g;
      pointBuffer.baseColors[index * 3 + 2] = pointColor.b;
      pointBuffer.baseSizes[index] = resolved.nodeSize(node);
    });
    updateVisibility();
  }

  return {
    object: pointCloud,
    visibleSizeAt: (index: number) => pointBuffer.visibleSizes[index],
    updateAppearance,
    updateVisibility,
    grow(prevCount, dataset) {
      pointBuffer.grow(prevCount, dataset, nodePositions);
      pointsMaterial.uniforms.densityScale.value = resolveDensityScale(dataset.nodes.length);
    },
    setFocus(focusActive, focusPosition) {
      pointsMaterial.uniforms.focusActive.value = focusActive ? 1 : 0;
      if (focusPosition) pointsMaterial.uniforms.focusPosition.value.copy(focusPosition);
    },
    resetPulse() {
      pointsMaterial.uniforms.uTime.value = 0;
    },
    setPulseTime(time) {
      pointsMaterial.uniforms.uTime.value = time;
    },
    setGlobalOpacity(hasSelection) {
      pointsMaterial.uniforms.globalOpacity.value = hasSelection ? SELECTION_POINT_OPACITY : 1;
    },
    setGalaxyMode(galaxyMode) {
      pointsMaterial.uniforms.baseSize.value = galaxyMode ? POINT_BASE_SIZE_GALAXY : POINT_BASE_SIZE_DEFAULT;
    },
    setNodeSizeScale(scale) {
      pointsMaterial.uniforms.nodeSizeScale.value = scale;
    },
    setPixelRatio(pixelRatio) {
      pointsMaterial.uniforms.pixelRatio.value = pixelRatio;
      pointsMaterial.uniforms.minPointSize.value = POINT_MIN_PIXEL_SIZE * pixelRatio;
    },
  };
}
