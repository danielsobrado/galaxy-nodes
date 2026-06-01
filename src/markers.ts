import * as THREE from 'three';
import type { EndpointMarker, HoverNodeMarker, SceneEdgeEndpoint } from './sceneTypes';
import {
  HOVER_BALL_MAX_SCALE,
  HOVER_BALL_MIN_SCALE,
  HOVER_BALL_OPACITY,
  HOVER_BALL_RADIUS_FACTOR,
  MARKER_ATMOSPHERE_OPACITY_BASE,
  MARKER_ATMOSPHERE_OPACITY_SPAN,
  MARKER_ATMOSPHERE_SCALE,
  MARKER_CORE_OPACITY_BASE,
  MARKER_CORE_OPACITY_SPAN,
  MARKER_CORE_SCALE,
  MARKER_INNER_RING_OPACITY_BASE,
  MARKER_INNER_RING_OPACITY_SPAN,
  MARKER_INNER_RING_SCALE,
  MARKER_MIN_SCALE,
  MARKER_OUTER_RING_OPACITY_BASE,
  MARKER_OUTER_RING_OPACITY_SPAN,
  MARKER_OUTER_RING_SCALE,
} from './sceneConstants';

export function createEndpointMarker(color: string) {
  const group = new THREE.Group();
  group.visible = false;

  const atmosphereGeometry = new THREE.SphereGeometry(1, 32, 18);
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  atmosphere.renderOrder = 30;
  group.add(atmosphere);

  const coreGeometry = new THREE.SphereGeometry(1, 24, 16);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.renderOrder = 31;
  group.add(core);

  const ringGeometry = new THREE.RingGeometry(1.18, 1.28, 96);
  const innerRingMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const innerRing = new THREE.Mesh(ringGeometry, innerRingMaterial);
  innerRing.renderOrder = 32;
  innerRing.rotation.set(Math.PI * 0.54, Math.PI * 0.08, 0);
  group.add(innerRing);

  const outerRingMaterial = innerRingMaterial.clone();
  outerRingMaterial.opacity = 0.12;
  const outerRing = new THREE.Mesh(ringGeometry, outerRingMaterial);
  outerRing.renderOrder = 32;
  outerRing.rotation.set(Math.PI * 0.5, Math.PI * 0.32, Math.PI * 0.33);
  group.add(outerRing);

  return { atmosphere, group, core, innerRing, outerRing };
}

export function setMarkerColor(marker: EndpointMarker, color: string) {
  (marker.atmosphere.material as THREE.MeshBasicMaterial).color.set(color);
  (marker.core.material as THREE.MeshBasicMaterial).color.set(color);
  (marker.innerRing.material as THREE.MeshBasicMaterial).color.set(color);
  (marker.outerRing.material as THREE.MeshBasicMaterial).color.set(color);
}

export function setMarkerStrength(marker: EndpointMarker, strength: number) {
  const clamped = Math.max(0, Math.min(1, strength));
  (marker.atmosphere.material as THREE.MeshBasicMaterial).opacity =
    MARKER_ATMOSPHERE_OPACITY_BASE + clamped * MARKER_ATMOSPHERE_OPACITY_SPAN;
  (marker.core.material as THREE.MeshBasicMaterial).opacity = MARKER_CORE_OPACITY_BASE + clamped * MARKER_CORE_OPACITY_SPAN;
  (marker.innerRing.material as THREE.MeshBasicMaterial).opacity =
    MARKER_INNER_RING_OPACITY_BASE + clamped * MARKER_INNER_RING_OPACITY_SPAN;
  (marker.outerRing.material as THREE.MeshBasicMaterial).opacity =
    MARKER_OUTER_RING_OPACITY_BASE + clamped * MARKER_OUTER_RING_OPACITY_SPAN;
}

export function setMarkerVisible(
  marker: EndpointMarker,
  endpoint: SceneEdgeEndpoint | null,
  color: string,
  scaleMultiplier: number,
  strength = 1,
) {
  marker.group.visible = Boolean(endpoint);
  if (!endpoint) return;

  setMarkerColor(marker, color);
  setMarkerStrength(marker, strength);
  const scale = Math.max(MARKER_MIN_SCALE, endpoint.radius * scaleMultiplier);
  marker.group.position.copy(endpoint.position);
  marker.atmosphere.scale.setScalar(scale * MARKER_ATMOSPHERE_SCALE);
  marker.core.scale.setScalar(scale * MARKER_CORE_SCALE);
  marker.innerRing.scale.setScalar(scale * MARKER_INNER_RING_SCALE);
  marker.outerRing.scale.setScalar(scale * MARKER_OUTER_RING_SCALE);
}

export function createHoverNodeMarker(color: string): HoverNodeMarker {
  const group = new THREE.Group();
  group.visible = false;

  const ballMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: HOVER_BALL_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), ballMaterial);
  ball.renderOrder = 35;
  group.add(ball);

  return { ball, group };
}

export function setHoverNodeMarkerVisible(marker: HoverNodeMarker, endpoint: SceneEdgeEndpoint | null, color: string) {
  marker.group.visible = Boolean(endpoint);
  if (!endpoint) return;

  (marker.ball.material as THREE.MeshBasicMaterial).color.set(color);
  marker.group.position.copy(endpoint.position);
  marker.ball.scale.setScalar(
    Math.max(HOVER_BALL_MIN_SCALE, Math.min(HOVER_BALL_MAX_SCALE, endpoint.radius * HOVER_BALL_RADIUS_FACTOR)),
  );
}
