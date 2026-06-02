import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createHoverNodeMarker, setHoverNodeMarkerVisible } from './markers';
import type { SceneEdgeEndpoint } from './sceneTypes';

function endpoint(id: string, radius: number): SceneEdgeEndpoint {
  return {
    id,
    isNode: true,
    label: id,
    position: new THREE.Vector3(),
    radius,
  };
}

describe('hover node markers', () => {
  it('scales the hover circle with endpoint radius instead of flattening all nodes to one size', () => {
    const marker = createHoverNodeMarker('#ffffff');

    setHoverNodeMarkerVisible(marker, endpoint('small', 14), '#ffffff');
    const smallScale = marker.ball.scale.x;

    setHoverNodeMarkerVisible(marker, endpoint('large', 60), '#ffffff');
    const largeScale = marker.ball.scale.x;

    expect(largeScale).toBeGreaterThan(smallScale * 3);
  });
});
