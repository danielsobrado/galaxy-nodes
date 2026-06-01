import * as THREE from 'three';
import type { GraphEdge, ResolvedAccessors } from './types';
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

export function selectedEdgeLabelPosition<EMeta>(
  state: EdgeVisualState<EMeta>,
  accessors: ResolvedAccessors<unknown, EMeta>,
  galaxyMode: boolean,
) {
  return getEdgeSpec(state.edge, state.endpoints, accessors, galaxyMode).curve.getPoint(0.5);
}
