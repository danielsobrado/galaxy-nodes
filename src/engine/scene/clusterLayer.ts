import * as THREE from 'three';
import type { ResolvedLayoutCluster } from '../../domain/layout';
import {
  CLUSTER_LABEL_HEIGHT_FACTOR,
  CLUSTER_SPRITE_SCALE_DEFAULT,
  CLUSTER_SPRITE_SCALE_GALAXY,
  FOCUS_CLUSTER_DIM_FACTOR,
  GLOW_SPRITE_OPACITY,
} from '../sceneConstants';
import { makeGlowTexture } from '../materials';
import { makeSceneLabel, shouldShowClusterLabel } from '../labels';
import type { SceneLabel } from '../sceneTypes';

interface ClusterVisual {
  group?: string;
  label: SceneLabel;
  labelText: string;
  labelIndex: number;
  radius: number;
  sprite: THREE.Sprite;
}

export interface ClusterLayerDeps {
  world: THREE.Object3D;
  labelsRoot: HTMLDivElement;
  /** Shared label pool projected by the animation loop; cluster labels are appended to it. */
  labels: SceneLabel[];
  clusters: readonly ResolvedLayoutCluster[];
  galaxyMode: () => boolean;
  activeGroup: () => string | null;
  showClusters: () => boolean;
}

export interface ClusterLayer {
  updateVisibility(): void;
  /** Dim the cluster glow sprites while a node/edge is focused. */
  setFocusDim(hasSelection: boolean): void;
  dispose(): void;
}

/**
 * Cluster glow sprites and their labels. Owns the shared glow texture/material template and
 * derives per-cluster visibility/scale/label from the active group + cluster toggle.
 */
export function createClusterLayer({
  world,
  labelsRoot,
  labels,
  clusters,
  galaxyMode,
  activeGroup,
  showClusters,
}: ClusterLayerDeps): ClusterLayer {
  const glowTexture = makeGlowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: GLOW_SPRITE_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const clusterVisuals: ClusterVisual[] = clusters.map((cluster, index) => {
    const sprite = new THREE.Sprite(glowMaterial.clone());
    sprite.position.set(cluster.center.x, cluster.center.y, cluster.center.z);
    world.add(sprite);

    const label = makeSceneLabel(labelsRoot, 'cluster-label');
    labels.push(label);
    label.position.set(
      cluster.center.x,
      cluster.center.y + cluster.radius * CLUSTER_LABEL_HEIGHT_FACTOR,
      cluster.center.z,
    );

    return {
      group: cluster.group,
      label,
      labelText: cluster.label,
      labelIndex: index,
      radius: cluster.radius,
      sprite,
    };
  });

  function updateVisibility() {
    const group = activeGroup();
    const galaxy = galaxyMode();
    const clustersVisible = showClusters();
    let visibleClusterIndex = 0;
    clusterVisuals.forEach((clusterVisual) => {
      const visibleByGroup = group === null || clusterVisual.group === group;
      const visible = clustersVisible && visibleByGroup;
      const scale = clusterVisual.radius * (galaxy ? CLUSTER_SPRITE_SCALE_GALAXY : CLUSTER_SPRITE_SCALE_DEFAULT);
      clusterVisual.sprite.visible = visible;
      clusterVisual.sprite.scale.set(scale, scale, 1);

      const shouldLabel = visible && shouldShowClusterLabel(visibleClusterIndex, group);
      clusterVisual.label.active = shouldLabel;
      clusterVisual.label.element.textContent = shouldLabel ? clusterVisual.labelText : '';
      clusterVisual.label.element.style.display = shouldLabel ? clusterVisual.label.element.style.display : 'none';
      if (visibleByGroup) visibleClusterIndex += 1;
    });
  }

  function setFocusDim(hasSelection: boolean) {
    clusterVisuals.forEach(({ sprite }) => {
      (sprite.material as THREE.SpriteMaterial).opacity =
        GLOW_SPRITE_OPACITY * (hasSelection ? FOCUS_CLUSTER_DIM_FACTOR : 1);
    });
  }

  function dispose() {
    glowTexture.dispose();
    glowMaterial.dispose();
  }

  return { updateVisibility, setFocusDim, dispose };
}
