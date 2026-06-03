import * as THREE from 'three';
import type { GalaxyGraphBlendMode } from '../rendererConfig';

export function themeBlending(mode: GalaxyGraphBlendMode): THREE.Blending {
  return mode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
}

export function setMaterialBlending(material: THREE.Material, mode: GalaxyGraphBlendMode) {
  const nextBlending = themeBlending(mode);
  if (material.blending === nextBlending) return;
  material.blending = nextBlending;
  material.needsUpdate = true;
}
