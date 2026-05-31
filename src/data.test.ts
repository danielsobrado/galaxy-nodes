import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  defaultEdgeColor,
  defaultEdgeWeight,
  defaultNodeColor,
  defaultNodeLabel,
  defaultNodeSize,
  formatCompactNumber,
  getEdgeId,
  parseGraphDataset,
  resolveAccessors,
} from './data';
import type { GraphDataset, GraphNode } from './types';

const sampleNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  id: 'node-1',
  position: { x: 1, y: 2, z: 3 },
  ...overrides,
});

describe('parseGraphDataset', () => {
  it('rejects a non-object payload', () => {
    expect(() => parseGraphDataset(null)).toThrow(/JSON object/);
  });

  it('rejects a payload missing the required node or edge arrays', () => {
    expect(() => parseGraphDataset({ nodes: [] })).toThrow(/nodes and edges/);
    expect(() => parseGraphDataset({ edges: [] })).toThrow(/nodes and edges/);
  });

  it('accepts a minimal node (id only) and passes meta through untouched', () => {
    const parsed = parseGraphDataset({
      nodes: [{ id: 'a', meta: { anything: [1, 2] } }],
      edges: [],
    });
    expect(parsed.nodes[0]).toEqual({ id: 'a', meta: { anything: [1, 2] } });
    expect(parsed.clusters).toEqual([]);
  });

  it('rejects non-array clusters when provided', () => {
    expect(() => parseGraphDataset({ nodes: [], edges: [], clusters: 'nope' })).toThrow(/clusters/);
  });

  it('keeps optional fields when present', () => {
    const parsed = parseGraphDataset({
      nodes: [{ id: 'a', position: { x: 0, y: 0, z: 0 }, label: 'A', size: 4, major: true, group: 'g', color: '#fff' }],
      edges: [],
      clusters: [],
    });
    expect(parsed.nodes[0]).toMatchObject({ label: 'A', size: 4, major: true, group: 'g', color: '#fff' });
  });

  it('rejects malformed positions when provided', () => {
    expect(() =>
      parseGraphDataset({ nodes: [{ id: 'a', position: { x: 0, y: 'nope', z: 0 } }], edges: [], clusters: [] }),
    ).toThrow(/nodes\[0\]\.position\.y/);
  });

  it('rejects malformed cluster centers when provided', () => {
    expect(() =>
      parseGraphDataset({ nodes: [], edges: [], clusters: [{ id: 'cluster-a', label: 'A', center: { x: 0, z: 0 } }] }),
    ).toThrow(/clusters\[0\]\.center\.y/);
  });

  it('rejects malformed cluster radii when provided', () => {
    expect(() =>
      parseGraphDataset({ nodes: [], edges: [], clusters: [{ id: 'cluster-a', label: 'A', radius: 0 }] }),
    ).toThrow(/clusters\[0\]\.radius/);
  });

  it('reports the offending path for an invalid optional field', () => {
    expect(() =>
      parseGraphDataset({ nodes: [{ id: 'a', position: { x: 0, y: 0, z: 0 }, size: 'big' }], edges: [], clusters: [] }),
    ).toThrow(/nodes\[0\]\.size/);
  });

  it('requires edge source and target', () => {
    expect(() => parseGraphDataset({ nodes: [], edges: [{ source: 'a' }], clusters: [] })).toThrow(
      /edges\[0\]\.target/,
    );
  });

  it('defaults generatedAt when absent', () => {
    const parsed = parseGraphDataset({ nodes: [], edges: [] });
    expect(typeof parsed.generatedAt).toBe('string');
    expect(parsed.generatedAt.length).toBeGreaterThan(0);
  });

  it('allows typed datasets without coordinates or clusters', () => {
    type Meta = { kind: 'person' };
    const dataset: GraphDataset<Meta> = {
      nodes: [{ id: 'a', meta: { kind: 'person' } }],
      edges: [],
    };

    expectTypeOf(dataset.nodes[0].meta).toEqualTypeOf<Meta | undefined>();
    expect(dataset.clusters).toBeUndefined();
  });
});

describe('default accessors', () => {
  it('honours an explicit node color over the group hash', () => {
    expect(defaultNodeColor(sampleNode({ color: '#123456', group: 'x' }))).toBe('#123456');
  });

  it('hashes the same group to a stable color', () => {
    const a = defaultNodeColor(sampleNode({ group: 'alpha' }));
    const b = defaultNodeColor(sampleNode({ group: 'alpha' }));
    expect(a).toBe(b);
    expect(a).toMatch(/^#/);
  });

  it('falls back to a neutral color without a group', () => {
    expect(defaultNodeColor(sampleNode())).toBe('#9ca3af');
  });

  it('defaults size, label, and edge weight', () => {
    expect(defaultNodeSize(sampleNode())).toBe(1);
    expect(defaultNodeSize(sampleNode({ size: 7 }))).toBe(7);
    expect(defaultNodeLabel(sampleNode())).toBeNull();
    expect(defaultNodeLabel(sampleNode({ label: 'hi' }))).toBe('hi');
    expect(defaultEdgeWeight({ source: 'a', target: 'b' })).toBe(0.5);
  });

  it('colors filament edges differently from relationships', () => {
    expect(defaultEdgeColor({ source: 'a', target: 'b', kind: 'filament' })).toBe('#aeb8c2');
    expect(defaultEdgeColor({ source: 'a', target: 'b' })).toBe('#6bd7ff');
    expect(defaultEdgeColor({ source: 'a', target: 'b', color: '#abc' })).toBe('#abc');
  });

  it('resolveAccessors fills every slot, preferring overrides', () => {
    const resolved = resolveAccessors({ nodeSize: () => 99 });
    expect(resolved.nodeSize(sampleNode())).toBe(99);
    expect(resolved.nodeColor(sampleNode({ color: '#000' }))).toBe('#000');
    expect(typeof resolved.edgeColor({ source: 'a', target: 'b' })).toBe('string');
  });
});

describe('getEdgeId', () => {
  it('prefers an explicit id', () => {
    expect(getEdgeId({ id: 'edge-x', source: 'a', target: 'b', kind: 'trade' })).toBe('edge-x');
  });

  it('falls back to a composite id using the index', () => {
    expect(getEdgeId({ source: 'a', target: 'b', kind: 'signal' }, 7)).toBe('signal:a->b:7');
    expect(getEdgeId({ source: 'a', target: 'b' }, 2)).toBe('edge:a->b:2');
  });
});

describe('formatCompactNumber', () => {
  it('formats thousands and millions compactly', () => {
    expect(formatCompactNumber(1_500)).toBe('1.5K');
    expect(formatCompactNumber(2_400_000)).toBe('2.4M');
  });
});
