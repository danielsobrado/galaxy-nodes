import * as THREE from 'three';
import {
  DIM_COLOR_LERP,
  DIM_COLOR_MULTIPLIER,
  PLANET_COLOR_WHITEN,
  POINT_COLOR_BRIGHTEN,
  POINT_COLOR_LERP,
} from './sceneConstants';

const tmpPointCloudColor = new THREE.Color();
const pointCloudLerpColor = new THREE.Color(0xf4f7f2);

export function makeGlowTexture() {
  const size = 256;
  const center = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;

  // Base orb: a small hot core with a long, smooth falloff. Spreading the stops out
  // (instead of one bright plateau) keeps the sprite from reading as a flat coin when
  // it is scaled up to cluster size.
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.1, 'rgba(170,255,235,0.7)');
  gradient.addColorStop(0.28, 'rgba(95,235,205,0.34)');
  gradient.addColorStop(0.55, 'rgba(70,190,235,0.13)');
  gradient.addColorStop(0.82, 'rgba(60,150,220,0.04)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  // Volumetric structure: a few faint off-centre puffs break up the uniform disc so it
  // reads as gaseous depth rather than a flat fill. Additive blending in the scene means
  // only the brighter puffs register, so they layer like nebula clouds.
  const puffs = [
    { x: 0.42, y: 0.4, r: 0.34, a: 0.1 },
    { x: 0.6, y: 0.52, r: 0.28, a: 0.08 },
    { x: 0.5, y: 0.62, r: 0.22, a: 0.07 },
    { x: 0.36, y: 0.58, r: 0.18, a: 0.06 },
  ];
  for (const puff of puffs) {
    const px = puff.x * size;
    const py = puff.y * size;
    const pr = puff.r * size;
    const puffGradient = context.createRadialGradient(px, py, 0, px, py, pr);
    puffGradient.addColorStop(0, `rgba(190,255,240,${puff.a})`);
    puffGradient.addColorStop(1, 'rgba(190,255,240,0)');
    context.fillStyle = puffGradient;
    context.beginPath();
    context.arc(px, py, pr, 0, Math.PI * 2);
    context.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

export function makePlanetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(92, 78, 14, 128, 128, 136);
  gradient.addColorStop(0, '#fbfff8');
  gradient.addColorStop(0.4, '#eef6f1');
  gradient.addColorStop(0.78, '#d5e0dc');
  gradient.addColorStop(1, '#b6c5c0');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  for (let band = 0; band < 8; band += 1) {
    context.fillStyle = band % 2 === 0 ? '#f8fbf7' : '#5e6d68';
    context.globalAlpha = band % 2 === 0 ? 0.2 : 0.06;
    context.beginPath();
    context.ellipse(128, 34 + band * 24, 124, 5 + (band % 4) * 4, band * 0.07, 0, Math.PI * 2);
    context.fill();
  }

  // Specular-ish highlight on the lit (upper-left) side.
  context.globalAlpha = 0.28;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(92, 82, 34, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  // Terminator: a smooth shadow anchored to the lower-right gives a clear day/night
  // falloff so the disc reads as a lit sphere rather than a flat textured circle.
  // (Materials are additively blended in the scene, so darker pixels simply add less.)
  const shade = context.createRadialGradient(96, 88, 40, 168, 176, 168);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.62, 'rgba(0,0,0,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.26)');
  context.fillStyle = shade;
  context.fillRect(0, 0, 256, 256);

  // Thin rim light on the lit limb to lift the silhouette edge.
  context.globalAlpha = 0.22;
  context.lineWidth = 6;
  context.strokeStyle = '#f4fffb';
  context.beginPath();
  context.arc(128, 128, 122, Math.PI * 0.78, Math.PI * 1.5);
  context.stroke();
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function dimColor(color: string, multiplier = DIM_COLOR_MULTIPLIER) {
  return new THREE.Color(color).lerp(new THREE.Color(0xe6f2ee), DIM_COLOR_LERP).multiplyScalar(multiplier);
}

export function planetColor(color: string) {
  return new THREE.Color(color).lerp(new THREE.Color(0xffffff), PLANET_COLOR_WHITEN);
}

export function pointCloudColor(color: string) {
  return tmpPointCloudColor.set(color).lerp(pointCloudLerpColor, POINT_COLOR_LERP).multiplyScalar(POINT_COLOR_BRIGHTEN);
}
