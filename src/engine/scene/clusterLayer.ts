import * as THREE from 'three';
import type { ResolvedLayoutCluster } from '../../domain/layout';
import {
  CLUSTER_LABEL_HEIGHT_FACTOR,
  CLUSTER_SPRITE_SCALE_DEFAULT,
  CLUSTER_SPRITE_SCALE_GALAXY,
} from '../sceneConstants';
import { makeGlowTexture } from '../materials';
import { makeSceneLabel, shouldShowClusterLabel } from '../labels';
import type { SceneLabel } from '../sceneTypes';
import type { ResolvedGalaxyGraphTheme } from '../rendererConfig';
import type { GalaxyVisibilityProjection } from '../visibilityModel';
import { setMaterialBlending, themeBlending } from './themeRuntime';

interface ClusterVisual {
  group?: string;
  id: string;
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
  theme: () => ResolvedGalaxyGraphTheme;
  galaxyMode: () => boolean;
  activeGroup: () => string | null;
  showClusters: () => boolean;
  visibility?: () => GalaxyVisibilityProjection | undefined;
}

export interface ClusterLayer {
  updateVisibility(): void;
  /** Dim the cluster glow sprites while a node/edge is focused. */
  setFocusDim(hasSelection: boolean): void;
  setTheme(): void;
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
  theme,
  galaxyMode,
  activeGroup,
  showClusters,
  visibility,
}: ClusterLayerDeps): ClusterLayer {
  const glowTexture = makeGlowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: theme().scene.clusterOpacity,
    depthWrite: false,
    blending: themeBlending(theme().scene.markerBlending),
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
      id: cluster.id,
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
    const projection = visibility?.();
    let visibleClusterIndex = 0;
    clusterVisuals.forEach((clusterVisual) => {
      const visibleByGroup = group === null || clusterVisual.group === group;
      const visibleByProjection = projection ? projection.visibleClusterIds.has(clusterVisual.id) : visibleByGroup;
      const visible = clustersVisible && visibleByProjection;
      const scale = clusterVisual.radius * (galaxy ? CLUSTER_SPRITE_SCALE_GALAXY : CLUSTER_SPRITE_SCALE_DEFAULT);
      clusterVisual.sprite.visible = visible;
      clusterVisual.sprite.scale.set(scale, scale, 1);

      const shouldLabel =
        visible &&
        (projection
          ? projection.labelClusterIds.has(clusterVisual.id)
          : shouldShowClusterLabel(visibleClusterIndex, group));
      clusterVisual.label.active = shouldLabel;
      clusterVisual.label.element.textContent = shouldLabel ? clusterVisual.labelText : '';
      clusterVisual.label.element.style.display = shouldLabel ? clusterVisual.label.element.style.display : 'none';
      if (visibleByProjection) visibleClusterIndex += 1;
    });
  }

  function setFocusDim(hasSelection: boolean) {
    const currentTheme = theme();
    clusterVisuals.forEach(({ sprite }) => {
      (sprite.material as THREE.SpriteMaterial).opacity =
        currentTheme.scene.clusterOpacity * (hasSelection ? currentTheme.scene.clusterFocusOpacityMultiplier : 1);
    });
  }

  function setTheme() {
    const currentTheme = theme();
    clusterVisuals.forEach(({ sprite }) => {
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = currentTheme.scene.clusterOpacity;
      setMaterialBlending(material, currentTheme.scene.markerBlending);
    });
  }

  function dispose() {
    glowTexture.dispose();
    glowMaterial.dispose();
  }

  return { updateVisibility, setFocusDim, setTheme, dispose };
}
