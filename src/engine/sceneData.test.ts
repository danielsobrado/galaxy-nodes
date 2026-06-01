import { describe, expect, it } from 'vitest';
import {
  buildNodeDegrees,
  buildSceneNodeIndex,
  countRenderablePoints,
  edgeMatchesActiveGroup,
  getSceneRebuildKey,
  maxDegreeForMode,
  planetSizeMultiplierForDegree,
  getVisiblePointIndexes,
  selectPlanetOverlayNodesBySizing,
  selectMajorOverlayNodes,
  writeVisiblePointSizes,
  type PlanetSizingMode,
} from './sceneData';
import type { GraphDataset, GraphNode } from '../domain/types';

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
    const manyMajorNodes = Array.from(
      { length: 120 },
      (_, index): GraphNode => ({
        id: `node-${index}`,
        group: index % 2 === 0 ? 'Even' : 'Odd',
        major: true,
      }),
    );
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

  it('selects authored major planets by default accessor sizing', () => {
    const graph: GraphDataset = {
      nodes: [
        { id: 'authored', group: 'Alpha', major: true },
        { id: 'hub', group: 'Alpha' },
        { id: 'leaf-1', group: 'Alpha' },
        { id: 'leaf-2', group: 'Alpha' },
      ],
      edges: [
        { source: 'hub', target: 'leaf-1' },
        { source: 'hub', target: 'leaf-2' },
      ],
    };
    const index = buildSceneNodeIndex(graph.nodes);
    const degrees = buildNodeDegrees(graph);

    expect(
      selectPlanetOverlayNodesBySizing(index, graph.nodes, degrees, 'accessor', null).map((node) => node.id),
    ).toEqual(['authored']);
    expect(
      selectPlanetOverlayNodesBySizing(index, graph.nodes, degrees, 'degree', null, 1).map((node) => node.id),
    ).toEqual(['hub']);
  });

  it('memoizes degree ranking when a cache is supplied', () => {
    const graph: GraphDataset = {
      nodes: [
        { id: 'hub', group: 'Alpha' },
        { id: 'leaf', group: 'Alpha' },
      ],
      edges: [{ source: 'hub', target: 'leaf' }],
    };
    const index = buildSceneNodeIndex(graph.nodes);
    const degrees = buildNodeDegrees(graph);
    const cache = new Map<PlanetSizingMode, GraphNode[]>();

    selectPlanetOverlayNodesBySizing(index, graph.nodes, degrees, 'degree', null, undefined, undefined, cache);
    const ranked = cache.get('degree');
    expect(ranked).toBeDefined();

    // A second refresh (different group filter) must reuse the cached ranking
    // rather than re-sorting every node.
    selectPlanetOverlayNodesBySizing(index, graph.nodes, degrees, 'degree', 'Alpha', undefined, undefined, cache);
    expect(cache.get('degree')).toBe(ranked);
  });

  it('computes degree-based planet size multipliers without WebGL', () => {
    const graph: GraphDataset = {
      nodes: [{ id: 'source' }, { id: 'target' }, { id: 'isolated' }],
      edges: [{ source: 'source', target: 'target' }],
    };
    const degrees = buildNodeDegrees(graph);
    const sizing = { max: 2, min: 0.5, mode: 'outgoing' as const, scale: 3, strength: 1 };

    expect(maxDegreeForMode(graph.nodes, degrees, 'outgoing', null)).toBe(1);
    expect(planetSizeMultiplierForDegree(degrees.get('source'), sizing, 1)).toBe(6);
    expect(planetSizeMultiplierForDegree(degrees.get('target'), sizing, 1)).toBe(1.5);
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
