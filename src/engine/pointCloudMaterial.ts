import * as THREE from 'three';
import {
  FOCUS_DISTANCE_DIM_FACTOR,
  FOCUS_DISTANCE_INNER,
  FOCUS_DISTANCE_OUTER,
  POINT_BASE_SIZE_DEFAULT,
  POINT_BASE_SIZE_GALAXY,
  POINT_MIN_PIXEL_SIZE,
} from './sceneConstants';
import { resolveDensityScale, type ResolvedGalaxyGraphTheme } from './rendererConfig';
import { themeBlending } from './scene/themeRuntime';

interface PointCloudMaterialOptions {
  galaxyMode: boolean;
  nodeSizeScale: number;
  nodeCount: number;
  pixelRatio: number;
  theme: ResolvedGalaxyGraphTheme;
}

export function createPointCloudMaterial({
  galaxyMode,
  nodeSizeScale,
  nodeCount,
  pixelRatio,
  theme,
}: PointCloudMaterialOptions) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: themeBlending(theme.scene.pointBlending),
    vertexColors: true,
    uniforms: {
      pixelRatio: { value: pixelRatio },
      baseSize: { value: galaxyMode ? POINT_BASE_SIZE_GALAXY : POINT_BASE_SIZE_DEFAULT },
      nodeSizeScale: { value: nodeSizeScale },
      minPointSize: { value: POINT_MIN_PIXEL_SIZE * pixelRatio },
      globalOpacity: { value: 1 },
      densityScale: { value: resolveDensityScale(nodeCount) },
      focusActive: { value: 0 },
      focusPosition: { value: new THREE.Vector3() },
      focusInner: { value: FOCUS_DISTANCE_INNER },
      focusOuter: { value: FOCUS_DISTANCE_OUTER },
      focusDim: { value: FOCUS_DISTANCE_DIM_FACTOR },
      pointStyle: { value: theme.scene.pointStyle === 'disc' ? 1 : 0 },
      pointOpacity: { value: theme.scene.pointOpacity },
      pointStrokeColor: { value: new THREE.Color(theme.scene.pointStrokeColor) },
      pointStrokeOpacity: { value: theme.scene.pointStrokeOpacity },
      pointCoreBoost: { value: theme.scene.pointCoreBoost },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      varying float vSharpness;
      varying float vFocus;
      uniform float pixelRatio;
      uniform float baseSize;
      uniform float nodeSizeScale;
      uniform float minPointSize;
      uniform float focusActive;
      uniform vec3 focusPosition;
      uniform float focusInner;
      uniform float focusOuter;
      void main() {
        vColor = color;
        float focusDistance = distance(position, focusPosition);
        vFocus = mix(1.0, 1.0 - smoothstep(focusInner, focusOuter, focusDistance), focusActive);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float attenuation = clamp(300.0 / -mvPosition.z, 0.36, 3.65);
        vSharpness = smoothstep(0.9, 2.8, attenuation);
        // Floor the footprint so far points never go sub-pixel (which makes them blink
        // as the camera moves); the floor is already in device pixels.
        gl_PointSize = max(minPointSize, size * baseSize * nodeSizeScale * attenuation * pixelRatio);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vSharpness;
      varying float vFocus;
      uniform float globalOpacity;
      uniform float densityScale;
      uniform float focusActive;
      uniform float focusDim;
      uniform float pointStyle;
      uniform float pointOpacity;
      uniform vec3 pointStrokeColor;
      uniform float pointStrokeOpacity;
      uniform float pointCoreBoost;
      void main() {
        vec2 uv = gl_PointCoord.xy - vec2(0.5);
        float dist = length(uv);
        float focusOpacity = mix(focusDim, 1.0, vFocus);
        float themeOpacity = globalOpacity * densityScale * mix(1.0, focusOpacity, focusActive);
        if (pointStyle > 0.5) {
          float outer = 1.0 - smoothstep(0.47, 0.5, dist);
          float inner = 1.0 - smoothstep(0.35, 0.43, dist);
          float outline = max(outer - inner, 0.0);
          if (outer <= 0.0) discard;
          vec3 discColor = mix(pointStrokeColor, vColor, inner / max(inner + outline, 0.001));
          float discAlpha = max(inner * pointOpacity, outline * pointStrokeOpacity);
          gl_FragColor = vec4(discColor, discAlpha * themeOpacity);
          #include <colorspace_fragment>
          return;
        }
        float edge = mix(0.08, 0.18, vSharpness);
        float coreWidth = mix(0.16, 0.24, vSharpness);
        float alpha = smoothstep(0.5, edge, dist);
        float core = smoothstep(coreWidth, 0.0, dist);
        float opacity = mix(0.1, 0.22, vSharpness);
        gl_FragColor = vec4(vColor * (1.0 + core * pointCoreBoost), alpha * opacity * pointOpacity * themeOpacity);
        #include <colorspace_fragment>
      }
    `,
  });
}
