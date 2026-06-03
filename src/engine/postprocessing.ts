import * as THREE from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class AcesOutputPass extends OutputPass {
  toneMapping: THREE.ToneMapping = THREE.ACESFilmicToneMapping;

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    const previousToneMapping = renderer.toneMapping;
    renderer.toneMapping = this.toneMapping;
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      renderer.toneMapping = previousToneMapping;
    }
  }
}
