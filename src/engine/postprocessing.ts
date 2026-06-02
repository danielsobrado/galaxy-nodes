import * as THREE from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class AcesOutputPass extends OutputPass {
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    const previousToneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      renderer.toneMapping = previousToneMapping;
    }
  }
}
