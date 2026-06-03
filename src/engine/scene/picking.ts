import * as THREE from 'three';
import type { GraphEdge, GraphNode } from '../../domain/types';
import { POINT_PICK_THRESHOLD } from '../sceneConstants';
import type { PlanetOverlay } from './planetOverlay';
import type { PointLayer } from './pointLayer';

export interface PickingDeps<NMeta = unknown, EMeta = unknown> {
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  nodes: () => GraphNode<NMeta>[];
  nodeLookup: Map<string, GraphNode<NMeta>>;
  edgeLookup: Map<string, GraphEdge<EMeta>>;
  planetOverlay: PlanetOverlay;
  pointLayer: PointLayer<NMeta>;
  edgePickTargets: () => readonly THREE.Object3D[];
}

export interface PickingHit<NMeta = unknown, EMeta = unknown> {
  nodeId: string | null;
  edgeId: string | null;
  node: GraphNode<NMeta> | null;
  edge: GraphEdge<EMeta> | null;
}

export interface Picking<NMeta = unknown, EMeta = unknown> {
  intersectAt(clientX: number, clientY: number): PickingHit<NMeta, EMeta>;
}

export function createPicking<NMeta = unknown, EMeta = unknown>(
  deps: PickingDeps<NMeta, EMeta>,
): Picking<NMeta, EMeta> {
  const { renderer, camera, nodes, nodeLookup, edgeLookup, planetOverlay, pointLayer, edgePickTargets } = deps;
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: POINT_PICK_THRESHOLD };
  const pointer = new THREE.Vector2();

  function isNodeHit(entry: THREE.Intersection) {
    if (!entry.object.visible) return false;
    if (entry.object.userData.type === 'node-instances') {
      return entry.instanceId !== undefined && Boolean(planetOverlay.nodeIdAt(entry.instanceId));
    }
    if (entry.object.userData.type !== 'node-points' || entry.index === undefined) return false;
    return pointLayer.visibleSizeAt(entry.index) > 0;
  }

  function isEdgeHit(entry: THREE.Intersection) {
    return (
      Boolean(entry.object.userData.pickable) &&
      entry.object.userData.type === 'edge' &&
      Boolean(entry.object.userData.edgeId)
    );
  }

  function intersectAt(clientX: number, clientY: number): PickingHit<NMeta, EMeta> {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([planetOverlay.mesh, pointLayer.object, ...edgePickTargets()], false);
    const hit = hits.find((entry) => isNodeHit(entry) || isEdgeHit(entry));
    const instanceId = hit?.instanceId;
    const pointIndex = hit?.object.userData.type === 'node-points' ? hit.index : undefined;
    const nodeId =
      hit?.object.userData.type === 'node-instances' && instanceId !== undefined
        ? planetOverlay.nodeIdAt(instanceId) || null
        : pointIndex !== undefined && pointLayer.visibleSizeAt(pointIndex) > 0
          ? (nodes()[pointIndex]?.id ?? null)
          : null;
    const edgeId = (hit?.object.userData.edgeId as string | undefined) ?? null;
    return {
      nodeId,
      edgeId,
      node: nodeId ? (nodeLookup.get(nodeId) ?? null) : null,
      edge: edgeId ? (edgeLookup.get(edgeId) ?? null) : null,
    };
  }

  return { intersectAt };
}
