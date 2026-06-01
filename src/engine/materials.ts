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
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.24, 'rgba(120,255,220,0.78)');
  gradient.addColorStop(0.62, 'rgba(80,210,255,0.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
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

  context.globalAlpha = 0.28;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(92, 82, 34, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 0.015;
  context.fillStyle = '#000000';
  context.beginPath();
  context.arc(172, 170, 78, 0, Math.PI * 2);
  context.fill();
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
