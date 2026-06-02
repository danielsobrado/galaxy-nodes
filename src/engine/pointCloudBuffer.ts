import * as THREE from 'three';
import type { GraphDataset, GraphNode, Vec3 } from '../domain/types';
import { POINT_CAPACITY_GROWTH_FACTOR, POINT_CAPACITY_GROWTH_PAD } from './sceneConstants';

export class PointCloudBuffer<NMeta = unknown> {
  readonly geometry = new THREE.BufferGeometry();
  baseColors: Float32Array;
  colors: Float32Array;
  baseSizes: Float32Array;
  visibleSizes: Float32Array;

  private capacity: number;
  private positions: Float32Array;
  private colorAttribute: THREE.BufferAttribute;
  private sizeAttribute: THREE.BufferAttribute;

  constructor(nodes: GraphNode<NMeta>[], nodePositions: Map<string, Vec3>) {
    this.capacity = nodes.length;
    this.positions = new Float32Array(this.capacity * 3);
    this.baseColors = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.baseSizes = new Float32Array(this.capacity);
    this.visibleSizes = new Float32Array(this.capacity);

    nodes.forEach((node, index) => {
      const position = nodePositions.get(node.id)!;
      this.positions[index * 3] = position.x;
      this.positions[index * 3 + 1] = position.y;
      this.positions[index * 3 + 2] = position.z;
    });

    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3);
    this.sizeAttribute = new THREE.BufferAttribute(this.visibleSizes, 1);
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setAttribute('size', this.sizeAttribute);
  }

  grow<EMeta>(prevCount: number, dataset: GraphDataset<NMeta, EMeta>, nodePositions: Map<string, Vec3>) {
    const nextCount = dataset.nodes.length;
    if (nextCount > this.capacity) {
      const nextCapacity = Math.max(
        nextCount,
        Math.ceil(this.capacity * POINT_CAPACITY_GROWTH_FACTOR) + POINT_CAPACITY_GROWTH_PAD,
      );
      const grow = (source: Float32Array, stride: number) => {
        const next = new Float32Array(nextCapacity * stride);
        next.set(source.subarray(0, prevCount * stride));
        return next;
      };
      this.positions = grow(this.positions, 3);
      this.baseColors = grow(this.baseColors, 3);
      this.colors = grow(this.colors, 3);
      this.baseSizes = grow(this.baseSizes, 1);
      this.visibleSizes = grow(this.visibleSizes, 1);
      this.capacity = nextCapacity;

      this.colorAttribute = new THREE.BufferAttribute(this.colors, 3);
      this.sizeAttribute = new THREE.BufferAttribute(this.visibleSizes, 1);
      this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
      this.sizeAttribute.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
      this.geometry.setAttribute('color', this.colorAttribute);
      this.geometry.setAttribute('size', this.sizeAttribute);
    }

    for (let index = prevCount; index < nextCount; index += 1) {
      const node = dataset.nodes[index];
      const position = nodePositions.get(node.id);
      if (!position) continue;
      this.positions[index * 3] = position.x;
      this.positions[index * 3 + 1] = position.y;
      this.positions[index * 3 + 2] = position.z;
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.setDrawRange(0, nextCount);
    this.geometry.computeBoundingSphere();
  }

  markAppearanceUpdated() {
    this.colorAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
  }
}
