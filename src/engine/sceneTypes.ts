import type * as THREE from 'three';
import type { GraphEdge } from '../domain/types';

export interface SceneEdgeEndpoint {
  group?: string;
  id: string;
  isNode: boolean;
  label: string;
  position: THREE.Vector3;
  radius: number;
}

export interface EdgeEndpoints {
  source: SceneEdgeEndpoint;
  target: SceneEdgeEndpoint;
}

export interface EdgeVisualState<EMeta = unknown> {
  appearanceKey: string;
  baseOpacity: number;
  edge: GraphEdge<EMeta>;
  endpoints: EdgeEndpoints;
  geometryKey: string;
  /** Per-edge raycast proxy; only created in tube (quality) render mode. */
  hit: THREE.Mesh | null;
  id: string;
  visual: THREE.Object3D;
  visible: boolean;
}

export interface EndpointMarker {
  atmosphere: THREE.Mesh;
  group: THREE.Group;
  core: THREE.Mesh;
  innerRing: THREE.Mesh;
  outerRing: THREE.Mesh;
}

export interface HoverNodeMarker {
  ball: THREE.Mesh;
  group: THREE.Group;
}

export interface SceneLabel {
  active: boolean;
  element: HTMLDivElement;
  position: THREE.Vector3;
}
