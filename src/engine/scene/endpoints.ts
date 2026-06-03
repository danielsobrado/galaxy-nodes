import * as THREE from 'three';
import type { GraphNode, ResolvedAccessors, Vec3 } from '../../domain/types';
import {
  ENDPOINT_MIN_RADIUS,
  ENDPOINT_NODE_SIZE_FACTOR_MAJOR,
  ENDPOINT_NODE_SIZE_FACTOR_MINOR,
  ENDPOINT_PLANET_RADIUS_FACTOR,
} from '../sceneConstants';
import { nodeDisplayLabel } from '../labels';
import type { SceneEdgeEndpoint } from '../sceneTypes';

export function vectorToVec3(vector: THREE.Vector3): Vec3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  );
}

/**
 * Resolve an edge endpoint id to its scene position/radius. Nodes are looked up against
 * the live node maps; ids that are not nodes fall back to the cluster endpoint table.
 */
export function resolveEndpoint<NMeta, EMeta>(
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
    const radius = Math.max(
      ENDPOINT_MIN_RADIUS,
      planetRadius(node) * ENDPOINT_PLANET_RADIUS_FACTOR,
      accessors.nodeSize(node) * (node.major ? ENDPOINT_NODE_SIZE_FACTOR_MAJOR : ENDPOINT_NODE_SIZE_FACTOR_MINOR),
    );
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
