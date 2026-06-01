import * as THREE from 'three';
import type { GraphEdge, ResolvedAccessors } from '../domain/types';
import type { EdgeEndpoints, EdgeVisualState } from './sceneTypes';
import {
  EDGE_CURVE_DEFAULT_LIFT,
  EDGE_CURVE_DISTANCE_LIFT,
  EDGE_FILAMENT_HIT_RADIUS,
  EDGE_FILAMENT_HIT_SEGMENTS,
  EDGE_FILAMENT_LIFT_DEFAULT,
  EDGE_FILAMENT_LIFT_GALAXY,
  EDGE_FILAMENT_OPACITY_DEFAULT,
  EDGE_FILAMENT_OPACITY_GALAXY,
  EDGE_FILAMENT_RADIUS,
  EDGE_FILAMENT_VISUAL_SEGMENTS,
  EDGE_HIT_RADIUS,
  EDGE_HIT_SEGMENTS,
  EDGE_LIFT_BASE,
  EDGE_LIFT_PER_WEIGHT,
  EDGE_MIDPOINT_LERP,
  EDGE_OPACITY_BASE,
  EDGE_OPACITY_PER_WEIGHT,
  EDGE_RADIUS_BASE,
  EDGE_RADIUS_PER_WEIGHT,
  EDGE_VISUAL_SEGMENTS,
} from './sceneConstants';

export function curvedEdgeCurve(a: THREE.Vector3, b: THREE.Vector3, lift = EDGE_CURVE_DEFAULT_LIFT) {
  const midpoint = a.clone().lerp(b, EDGE_MIDPOINT_LERP);
  midpoint.y += lift + a.distanceTo(b) * EDGE_CURVE_DISTANCE_LIFT;
  return new THREE.QuadraticBezierCurve3(a, midpoint, b);
}

export function getEdgeSpec<EMeta>(
  edge: GraphEdge<EMeta>,
  endpoints: EdgeEndpoints,
  accessors: ResolvedAccessors<unknown, EMeta>,
  galaxyMode: boolean,
) {
  const isFilament = edge.kind === 'filament';
  const weight = accessors.edgeWeight(edge);
  const lift = isFilament
    ? galaxyMode
      ? EDGE_FILAMENT_LIFT_GALAXY
      : EDGE_FILAMENT_LIFT_DEFAULT
    : EDGE_LIFT_BASE + weight * EDGE_LIFT_PER_WEIGHT;
  const radius = isFilament ? EDGE_FILAMENT_RADIUS : EDGE_RADIUS_BASE + weight * EDGE_RADIUS_PER_WEIGHT;
  const opacity = isFilament
    ? galaxyMode
      ? EDGE_FILAMENT_OPACITY_GALAXY
      : EDGE_FILAMENT_OPACITY_DEFAULT
    : EDGE_OPACITY_BASE + weight * EDGE_OPACITY_PER_WEIGHT;
  const curve = curvedEdgeCurve(endpoints.source.position, endpoints.target.position, lift);
  const visualSegments = isFilament ? EDGE_FILAMENT_VISUAL_SEGMENTS : EDGE_VISUAL_SEGMENTS;
  const hitSegments = isFilament ? EDGE_FILAMENT_HIT_SEGMENTS : EDGE_HIT_SEGMENTS;
  const hitRadius = isFilament ? EDGE_FILAMENT_HIT_RADIUS : EDGE_HIT_RADIUS;

  return {
    color: accessors.edgeColor(edge),
    curve,
    geometryKey: `${lift.toFixed(4)}:${radius.toFixed(4)}:${visualSegments}:${hitSegments}`,
    hitRadius,
    hitSegments,
    opacity,
    radius,
    visualSegments,
  };
}

export function createTubeGeometry(curve: THREE.Curve<THREE.Vector3>, segments: number, radius: number) {
  return new THREE.TubeGeometry(curve, segments, radius, 6, false);
}

// Lightweight edge geometry for scale (line) mode: the curve sampled into a
// LineSegments-compatible vertex pair list (a,b, b,c, ...). It carries the same
// `position`/`normal` attributes the merged edge buffer expects (normals are zeroed
// because the edge shader ignores them), so the existing range-writer can consume it
// unchanged - only the vertex count drops from ~1k per edge to segments*2.
export function createEdgeLineGeometry(curve: THREE.Curve<THREE.Vector3>, segments: number) {
  const points = curve.getPoints(segments);
  const segmentCount = Math.max(1, points.length - 1);
  const positions = new Float32Array(segmentCount * 2 * 3);
  for (let index = 0; index < segmentCount; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const offset = index * 6;
    positions[offset] = a.x;
    positions[offset + 1] = a.y;
    positions[offset + 2] = a.z;
    positions[offset + 3] = b.x;
    positions[offset + 4] = b.y;
    positions[offset + 5] = b.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(positions.length), 3));
  return geometry;
}

export function selectedEdgeLabelPosition<EMeta>(
  state: EdgeVisualState<EMeta>,
  accessors: ResolvedAccessors<unknown, EMeta>,
  galaxyMode: boolean,
) {
  return getEdgeSpec(state.edge, state.endpoints, accessors, galaxyMode).curve.getPoint(0.5);
}
