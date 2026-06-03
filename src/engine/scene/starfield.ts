import * as THREE from 'three';
import {
  FOCUS_STAR_DIM_FACTOR,
  MAX_STAR_COUNT,
  QUIET_STAR_COUNT,
  STAR_DISTANCE_MIN,
  STAR_DISTANCE_SPAN,
  STAR_OPACITY,
  STAR_SIZE,
  STAR_VERTICAL_SPREAD,
} from '../sceneConstants';

export interface Starfield {
  /** Show the full star count in galaxy mode, or the quieter subset otherwise. */
  setGalaxyMode(galaxyMode: boolean): void;
  /** Dim the stars while a node/edge is focused so the selection reads. */
  setFocusDim(hasSelection: boolean): void;
}

/**
 * Ambient background star points. Owns the (randomly seeded) point geometry/material and
 * adds the Points into `world`. The geometry is generated eagerly so its random sequence
 * is consumed at the same construction point as before extraction.
 */
export function createStarfield({ world, galaxyMode }: { world: THREE.Object3D; galaxyMode: boolean }): Starfield {
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(MAX_STAR_COUNT * 3);
  for (let index = 0; index < MAX_STAR_COUNT; index += 1) {
    const distance = STAR_DISTANCE_MIN + Math.random() * STAR_DISTANCE_SPAN;
    const angle = Math.random() * Math.PI * 2;
    starPositions[index * 3] = Math.cos(angle) * distance;
    starPositions[index * 3 + 1] = (Math.random() - 0.5) * STAR_VERTICAL_SPREAD;
    starPositions[index * 3 + 2] = Math.sin(angle) * distance;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setDrawRange(0, galaxyMode ? MAX_STAR_COUNT : QUIET_STAR_COUNT);
  const starMaterial = new THREE.PointsMaterial({
    color: 0xb8c9d9,
    size: STAR_SIZE,
    transparent: true,
    opacity: STAR_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  world.add(new THREE.Points(starGeometry, starMaterial));

  return {
    setGalaxyMode(nextGalaxyMode: boolean) {
      starGeometry.setDrawRange(0, nextGalaxyMode ? MAX_STAR_COUNT : QUIET_STAR_COUNT);
    },
    setFocusDim(hasSelection: boolean) {
      starMaterial.opacity = STAR_OPACITY * (hasSelection ? FOCUS_STAR_DIM_FACTOR : 1);
    },
  };
}
