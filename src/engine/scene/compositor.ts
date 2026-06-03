import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { AcesOutputPass } from '../postprocessing';
import { BLOOM_LAYER, BLOOM_RADIUS, BLOOM_STRENGTH, BLOOM_THRESHOLD, RENDER_MSAA_SAMPLES } from '../sceneConstants';

export interface CompositorOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  width: number;
  height: number;
  /** Invoked after an object's bloom-layer membership changes (lets the owner recompute whether bloom needs to run). */
  onBloomLayerChange?: () => void;
}

export interface Compositor {
  /** Toggle BLOOM_LAYER membership on every descendant of `object`. */
  setBloomLayer(object: THREE.Object3D, enabled: boolean): void;
  /** Composite one frame. When `bloomActive`, the bloom-only pass is rendered and added on top. */
  render(bloomActive: boolean): void;
  setSize(width: number, height: number): void;
  setToneMapping(toneMapping: THREE.ToneMapping): void;
  dispose(): void;
}

/**
 * Two-stage post-processing pipeline. A selective-bloom composer renders the BLOOM_LAYER
 * objects offscreen, then a final composer renders the full scene into a half-float MSAA
 * target and adds the bloom texture before ACES tone mapping. Owns all composer/pass/target
 * resources and the only `camera.layers` switching.
 */
export function createCompositor({
  renderer,
  scene,
  camera,
  width,
  height,
  onBloomLayerChange,
}: CompositorOptions): Compositor {
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  const bloomRenderPass = new RenderPass(scene, camera, null, new THREE.Color(0x000000), 1);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  bloomComposer.addPass(bloomRenderPass);
  bloomComposer.addPass(bloomPass);

  // The base scene renders into this offscreen target before bloom is composited and
  // tone-mapped. EffectComposer ignores the canvas `antialias` flag, so give the target
  // an explicit MSAA sample count or thin edges/geometry alias and shimmer on movement.
  const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const finalRenderTarget = new THREE.WebGLRenderTarget(drawingBufferSize.width, drawingBufferSize.height, {
    samples: RENDER_MSAA_SAMPLES,
    // Half-float so the many overlapping additive edges/points accumulate in HDR instead
    // of an 8-bit buffer. 8-bit quantises each low-opacity layer to ~20 levels, and those
    // bands crawl frame-to-frame as the camera moves (the grainy shimmer on the tubes);
    // float accumulation is smooth and lets tone mapping roll off highlights past 1.0.
    type: THREE.HalfFloatType,
  });
  const finalComposer = new EffectComposer(renderer, finalRenderTarget);
  const finalRenderPass = new RenderPass(scene, camera);
  const finalBloomPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
        }
      `,
    }),
    'baseTexture',
  );
  const emptyBloomTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  emptyBloomTexture.needsUpdate = true;
  const outputPass = new AcesOutputPass();
  finalComposer.addPass(finalRenderPass);
  finalComposer.addPass(finalBloomPass);
  finalComposer.addPass(outputPass);

  function setBloomLayer(object: THREE.Object3D, enabled: boolean) {
    object.traverse((entry) => {
      if (enabled) entry.layers.enable(BLOOM_LAYER);
      else entry.layers.disable(BLOOM_LAYER);
    });
    onBloomLayerChange?.();
  }

  function render(bloomActive: boolean) {
    if (bloomActive) {
      camera.layers.set(BLOOM_LAYER);
      bloomComposer.render();
      camera.layers.set(0);
      finalBloomPass.uniforms!.bloomTexture.value = bloomComposer.renderTarget2.texture;
    } else {
      finalBloomPass.uniforms!.bloomTexture.value = emptyBloomTexture;
    }
    finalComposer.render();
  }

  function setSize(nextWidth: number, nextHeight: number) {
    bloomComposer.setSize(nextWidth, nextHeight);
    finalComposer.setSize(nextWidth, nextHeight);
  }

  function setToneMapping(toneMapping: THREE.ToneMapping) {
    outputPass.toneMapping = toneMapping;
  }

  function dispose() {
    bloomPass.dispose();
    finalBloomPass.dispose();
    outputPass.dispose();
    bloomComposer.dispose();
    finalComposer.dispose();
    emptyBloomTexture.dispose();
  }

  return { setBloomLayer, render, setSize, setToneMapping, dispose };
}
