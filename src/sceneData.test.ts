import { describe, expect, it } from 'vitest';
import {
  buildSceneNodeIndex,
  countRenderablePoints,
  edgeMatchesActiveGroup,
  getSceneRebuildKey,
  getVisiblePointIndexes,
  selectMajorOverlayNodes,
  writeVisiblePointSizes,
} from './sceneData';
import type { GraphDataset, GraphNode } from './types';

describe('scene data helpers', () => {
  const nodes: GraphNode[] = [
    { id: 'a', group: 'Alpha', major: true },
    { id: 'b', group: 'Alpha' },
    { id: 'c', group: 'Beta', major: true },
    { id: 'd' },
  ];

  it('indexes point and major nodes by group', () => {
    const index = buildSceneNodeIndex(nodes);

    expect(index.allPointIndexes).toEqual([0, 1, 2, 3]);
    expect(index.pointIndexesByGroup.get('Alpha')).toEqual([0, 1]);
    expect(index.majorNodesAll.map((node) => node.id)).toEqual(['a', 'c']);
    expect(index.majorNodesByGroup.get('Beta')?.map((node) => node.id)).toEqual(['c']);
  });

  it('writes visible point sizes without dropping major nodes from the point cloud', () => {
    const index = buildSceneNodeIndex(nodes);
    const baseSizes = new Float32Array([10, 20, 30, 40]);
    const visibleSizes = new Float32Array(baseSizes.length);

    expect(writeVisiblePointSizes(visibleSizes, baseSizes, index, 'Alpha')).toBe(2);
    expect(Array.from(visibleSizes)).toEqual([10, 20, 0, 0]);
    expect(countRenderablePoints(nodes)).toBe(4);
  });

  it('returns empty point indexes for unknown groups', () => {
    const index = buildSceneNodeIndex(nodes);
    expect(getVisiblePointIndexes(index, 'Missing')).toEqual([]);
  });

  it('caps major overlays separately from point rendering', () => {
    const manyMajorNodes = Array.from({ length: 120 }, (_, index): GraphNode => ({
      id: `node-${index}`,
      group: index % 2 === 0 ? 'Even' : 'Odd',
      major: true,
    }));
    const index = buildSceneNodeIndex(manyMajorNodes);

    expect(selectMajorOverlayNodes(index, null).length).toBe(96);
    expect(selectMajorOverlayNodes(index, 'Even').length).toBe(48);
    expect(countRenderablePoints(manyMajorNodes)).toBe(120);
  });

  it('matches edge visibility by endpoint group', () => {
    expect(edgeMatchesActiveGroup('Alpha', 'Beta', null)).toBe(true);
    expect(edgeMatchesActiveGroup('Alpha', 'Beta', 'Alpha')).toBe(true);
    expect(edgeMatchesActiveGroup('Alpha', 'Beta', 'Gamma')).toBe(false);
  });

  it('keeps scene rebuild keys scoped to dataset topology and layout', () => {
    const dataset: GraphDataset = {
      nodes,
      edges: [{ source: 'a', target: 'b' }],
      clusters: [{ id: 'alpha', label: 'Alpha' }],
      generatedAt: 'stable',
    };

    expect(getSceneRebuildKey(dataset, 'auto')).toBe('stable:4:1:1:auto');
    expect(getSceneRebuildKey(dataset, 'layout-two')).toBe('stable:4:1:1:layout-two');
  });
});
