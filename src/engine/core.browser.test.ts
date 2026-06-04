import { commands, page, userEvent } from 'vitest/browser';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGalaxyRenderer,
  getGalaxyRendererContextBudget,
  type GalaxyRenderer,
  type GalaxyRendererOptions,
  type GraphUxEvent,
} from './core';
import '../styles.css';
import type { GraphDataset } from '../domain/types';

const VISUAL_BASELINE_PATH = 'src/engine/__screenshots__/core-renderer-galaxy.png';
const UPDATE_SCREENSHOTS = Boolean(import.meta.env.VITE_UPDATE_GALAXY_SCREENSHOTS);

const dataset: GraphDataset = {
  generatedAt: 'browser-renderer-test',
  clusters: [
    {
      id: 'cluster-core',
      label: 'Core Systems',
      group: 'core',
      center: { x: 0, y: 0, z: 0 },
      radius: 360,
      color: '#42f7bd',
    },
  ],
  nodes: [
    {
      id: 'hub',
      label: 'Hub',
      group: 'core',
      major: true,
      ring: true,
      color: '#42f7bd',
      size: 18,
      position: { x: 0, y: 0, z: 0 },
    },
    {
      id: 'alpha',
      label: 'Alpha',
      group: 'core',
      major: true,
      color: '#6bd7ff',
      size: 12,
      position: { x: 260, y: 0, z: 0 },
    },
    {
      id: 'beta',
      label: 'Beta',
      group: 'core',
      major: false,
      color: '#f5cf5b',
      size: 8,
      position: { x: -260, y: 18, z: 0 },
    },
    {
      id: 'gamma',
      label: 'Gamma',
      group: 'outer',
      major: true,
      color: '#ff6c86',
      size: 11,
      position: { x: 0, y: 120, z: -300 },
    },
  ],
  edges: [
    { id: 'supports', source: 'hub', target: 'alpha', label: 'supports', weight: 0.9, color: '#85fff0' },
    { id: 'feeds', source: 'beta', target: 'hub', label: 'feeds', weight: 0.55, color: '#f5cf5b' },
    { id: 'observes', source: 'hub', target: 'gamma', label: 'observes', weight: 0.65, color: '#ff8aa0' },
  ],
};

let activeRenderer: GalaxyRenderer | null = null;
let restoreRandom: (() => void) | null = null;

afterEach(() => {
  activeRenderer?.dispose();
  activeRenderer = null;
  restoreRandom?.();
  restoreRandom = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('createGalaxyRenderer in Chromium', () => {
  it('renders WebGL canvas, handles raycast hover/select, patches selection, and disposes cleanly', async () => {
    const onHoverNode = vi.fn();
    const onSelectNode = vi.fn();
    const onSelectEdge = vi.fn();
    const onSceneReady = vi.fn();
    const onSceneFailure = vi.fn();
    const addedMergedEdgeVisuals: THREE.Object3D[] = [];
    const addedEdgeVisuals: THREE.Object3D[] = [];
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function addSpy(
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      objects.forEach((object) => {
        if (object.userData.type === 'edge-visuals') addedMergedEdgeVisuals.push(object);
        if (object.userData.type === 'edge-visual') addedEdgeVisuals.push(object);
      });
      return originalAdd.apply(this, objects);
    });
    const { host } = await mountRenderer({
      onHoverNode,
      onSceneReady,
      onSceneFailure,
      onSelectNode,
      onSelectEdge,
    });

    const canvas = getCanvas(host);
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(host.querySelector('.scene-labels')).not.toBeNull();
    expect(host.querySelectorAll('.node-label').length).toBeGreaterThanOrEqual(dataset.nodes.length);
    expect(addedMergedEdgeVisuals).toHaveLength(0);
    expect(addedEdgeVisuals).toHaveLength(dataset.edges.length);
    expect(addedEdgeVisuals.every((edge) => edge instanceof THREE.Mesh)).toBe(true);
    expect(onSceneReady).toHaveBeenCalledTimes(1);
    expect(onSceneFailure).not.toHaveBeenCalled();
    expect(getGalaxyRendererContextBudget().active).toBe(1);

    await userEvent.hover(canvas);
    await vi.waitFor(() => expect(onHoverNode).toHaveBeenCalledWith(expect.objectContaining({ id: 'hub' })));

    await userEvent.click(canvas, { position: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 } });
    await vi.waitFor(() => expect(onSelectNode).toHaveBeenCalledWith(expect.objectContaining({ id: 'hub' })));
    expect(onSelectEdge).toHaveBeenCalledWith(null);

    activeRenderer?.update({
      ...rendererOptions(),
      accessors: {
        edgeLabel: (edge) => (edge.id === 'supports' ? 'linked_by' : null),
        nodeLabel: (node) => `Display ${node.id}`,
      },
      selectedEdgeId: 'supports',
    });

    await vi.waitFor(() => {
      expect(host.querySelector('.edge-label')?.textContent).toContain('Display hub -> linked by -> Display alpha');
    });
    expect(getCanvas(host)).toBe(canvas);

    activeRenderer?.dispose();
    activeRenderer = null;
    expect(host.childElementCount).toBe(0);
    expect(getGalaxyRendererContextBudget().active).toBe(0);
  });

  it('renders scale mode as per-edge LineSegments with no per-edge hit proxies', async () => {
    const edgeVisuals: THREE.Object3D[] = [];
    const edgeHitProxies: THREE.Object3D[] = [];
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function addSpy(
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      objects.forEach((object) => {
        if (object.userData.type === 'edge-visual') edgeVisuals.push(object);
        if (object.userData.type === 'edge') edgeHitProxies.push(object);
      });
      return originalAdd.apply(this, objects);
    });

    const onSceneFailure = vi.fn();
    const { host } = await mountRenderer({ onSceneFailure }, { renderMode: 'scale' });

    expect(onSceneFailure).not.toHaveBeenCalled();
    expect(edgeVisuals).toHaveLength(dataset.edges.length);
    // Scale mode draws edges as lines and creates no per-edge raycast tubes.
    expect(edgeVisuals.every((edge) => edge instanceof THREE.LineSegments)).toBe(true);
    expect(edgeHitProxies).toHaveLength(0);

    const canvas = getCanvas(host);
    expect(canvas.width).toBeGreaterThan(0);

    activeRenderer?.dispose();
    activeRenderer = null;
    expect(host.childElementCount).toBe(0);
    expect(getGalaxyRendererContextBudget().active).toBe(0);
  });

  it('emits graph UX telemetry for hover, click, focus, reset, and variant changes', async () => {
    const calls: string[] = [];
    const events: GraphUxEvent[] = [];
    const onGraphUxEvent = vi.fn((event: GraphUxEvent) => {
      events.push(event);
      calls.push(`ux:${event.type}`);
    });
    const onSelectNode = vi.fn(() => {
      calls.push('select:node');
    });
    const { host } = await mountRenderer({ onGraphUxEvent, onSelectNode }, { uxVariant: 'fullFocus' });
    const canvas = getCanvas(host);

    await userEvent.hover(canvas);
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === 'node_hover' && event.nodeId === 'hub')).toBe(true),
    );

    await userEvent.click(canvas, { position: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 } });
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === 'node_click' && event.nodeId === 'hub')).toBe(true),
    );
    expect(calls.indexOf('ux:node_click')).toBeLessThan(calls.indexOf('select:node'));

    activeRenderer?.update({
      ...rendererOptions(),
      cameraCommand: { nodeId: 'hub', nonce: 1, type: 'focus' },
      selectedNodeId: 'hub',
      uxVariant: 'fullFocus',
    });

    await vi.waitFor(() =>
      expect(events.some((event) => event.type === 'focus_completed' && event.nodeId === 'hub')).toBe(true),
    );
    const focusStarted = events.find((event) => event.type === 'focus_started' && event.nodeId === 'hub');
    const focusCompleted = events.find((event) => event.type === 'focus_completed' && event.nodeId === 'hub');
    expect(focusStarted).toEqual(expect.objectContaining({ variant: 'fullFocus' }));
    expect(focusCompleted).toEqual(
      expect.objectContaining({
        visibleEdgeCount: dataset.edges.length,
        visibleNodeCount: dataset.nodes.length,
      }),
    );
    expect((focusCompleted as Extract<GraphUxEvent, { type: 'focus_completed' }>).durationMs).toBeGreaterThanOrEqual(0);
    expect(events.some((event) => event.type === 'pan_or_orbit' || event.type === 'zoom_changed')).toBe(false);

    activeRenderer?.update({
      ...rendererOptions(),
      cameraCommand: { nonce: 2, type: 'reset' },
      selectedNodeId: 'hub',
      uxVariant: 'fullFocus',
    });
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === 'camera_reset' && event.focusedNodeId === 'hub')).toBe(true),
    );

    activeRenderer?.update({
      ...rendererOptions(),
      cameraCommand: { nodeId: 'alpha', nonce: 3, type: 'focus' },
      selectedNodeId: 'alpha',
      uxVariant: 'cameraOnly',
    });
    await vi.waitFor(() =>
      expect(
        events.some(
          (event) => event.type === 'focus_started' && event.nodeId === 'alpha' && event.variant === 'cameraOnly',
        ),
      ).toBe(true),
    );
  });

  it('classifies user camera zoom and pan/orbit telemetry while focused', async () => {
    const events: GraphUxEvent[] = [];
    const { host } = await mountRenderer(
      { onGraphUxEvent: (event: GraphUxEvent) => events.push(event) },
      {
        cameraCommand: { nodeId: 'hub', nonce: 1, type: 'focus' },
        selectedNodeId: 'hub',
        uxVariant: 'fullFocus',
      },
    );
    const canvas = getCanvas(host);
    await vi.waitFor(() => expect(events.some((event) => event.type === 'focus_completed')).toBe(true));
    events.length = 0;

    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: canvas.clientWidth / 2,
        clientY: canvas.clientHeight / 2,
        deltaY: -180,
      }),
    );
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === 'zoom_changed' && event.focusedNodeId === 'hub')).toBe(true),
    );

    events.length = 0;
    const originalSetPointerCapture = canvas.setPointerCapture;
    const originalReleasePointerCapture = canvas.releasePointerCapture;
    canvas.setPointerCapture = () => undefined;
    canvas.releasePointerCapture = () => undefined;
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        buttons: 1,
        clientX: canvas.clientWidth / 2,
        clientY: canvas.clientHeight / 2,
        pointerId: 7,
        pointerType: 'mouse',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        buttons: 1,
        clientX: canvas.clientWidth / 2 + 70,
        clientY: canvas.clientHeight / 2 + 20,
        pointerId: 7,
        pointerType: 'mouse',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        buttons: 0,
        clientX: canvas.clientWidth / 2 + 70,
        clientY: canvas.clientHeight / 2 + 20,
        pointerId: 7,
        pointerType: 'mouse',
      }),
    );

    canvas.setPointerCapture = originalSetPointerCapture;
    canvas.releasePointerCapture = originalReleasePointerCapture;

    await vi.waitFor(() =>
      expect(events.some((event) => event.type === 'pan_or_orbit' && event.focusedNodeId === 'hub')).toBe(true),
    );
  });

  it('renders relationships with the 0.1 additive BasicMaterial path, not a shader material', async () => {
    const edgeVisuals: THREE.Object3D[] = [];
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function addSpy(
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      objects.forEach((object) => {
        if (object.userData.type === 'edge-visual') edgeVisuals.push(object);
      });
      return originalAdd.apply(this, objects);
    });

    await mountRenderer({}, { renderMode: 'quality' });

    expect(edgeVisuals).toHaveLength(dataset.edges.length);
    const material = (edgeVisuals[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material).not.toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.opacity).toBeCloseTo(0.075 + 0.9 * 0.1, 5);
  });

  it('updates renderer theme materials and host CSS variables in place', async () => {
    const edgeVisuals: THREE.Object3D[] = [];
    const pointClouds: THREE.Object3D[] = [];
    const starfields: THREE.Object3D[] = [];
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function addSpy(
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      objects.forEach((object) => {
        if (object.userData.type === 'edge-visual') edgeVisuals.push(object);
        if (object.userData.type === 'node-points') pointClouds.push(object);
        if (object instanceof THREE.Points && object.userData.type !== 'node-points') starfields.push(object);
      });
      return originalAdd.apply(this, objects);
    });

    const { host } = await mountRenderer({}, { renderMode: 'quality', theme: 'network-light' });
    await waitForFrames(2);

    expect(host.style.getPropertyValue('--gn-bg')).toBe('#ffffff');
    expect(host.style.getPropertyValue('--gn-scene-vignette')).toBe('none');
    const edge = edgeMaterial(edgeVisuals[0]);
    expect(edge.blending).toBe(THREE.NormalBlending);
    expect(edge.opacity).toBeCloseTo((0.075 + 0.9 * 0.1) * 0.42, 5);
    expect(edge.color.getHexString()).toBe(new THREE.Color('#8dbed6').getHexString());
    const points = pointMaterial(pointClouds[0]);
    expect(points.blending).toBe(THREE.NormalBlending);
    expect(points.uniforms.pointStyle.value).toBe(1);
    expect(points.uniforms.pointStrokeOpacity.value).toBeGreaterThan(0.8);
    const stars = pointsMaterial(starfields[0]);
    expect(stars.opacity).toBe(0);

    const canvas = getCanvas(host);
    activeRenderer?.update({ ...rendererOptions(), renderMode: 'quality', theme: 'galaxy-dark' });
    await waitForFrames(2);

    expect(getCanvas(host)).toBe(canvas);
    expect(host.style.getPropertyValue('--gn-bg')).toBe('#000000');
    expect(host.style.getPropertyValue('--gn-scene-vignette')).toContain('radial-gradient');
    expect(edge.blending).toBe(THREE.AdditiveBlending);
    expect(points.blending).toBe(THREE.AdditiveBlending);
    expect(points.uniforms.pointStyle.value).toBe(0);
    expect(stars.opacity).toBeCloseTo(0.08, 5);
  });

  it('dims unrelated edges when an edge is selected', async () => {
    const focusDataset: GraphDataset = {
      generatedAt: 'edge-focus-test',
      nodes: [
        { id: 'a', label: 'A', group: 'core', position: { x: -180, y: 0, z: 0 }, size: 9 },
        { id: 'b', label: 'B', group: 'core', position: { x: 0, y: 0, z: 0 }, size: 9 },
        { id: 'c', label: 'C', group: 'core', position: { x: 180, y: 0, z: 0 }, size: 9 },
        { id: 'd', label: 'D', group: 'outer', position: { x: 180, y: 160, z: 0 }, size: 9 },
      ],
      edges: [
        { id: 'selected', source: 'a', target: 'b', weight: 0.9 },
        { id: 'connected', source: 'b', target: 'c', weight: 0.7 },
        { id: 'unrelated', source: 'c', target: 'd', weight: 0.6 },
      ],
    };
    const edgeVisuals: THREE.Object3D[] = [];
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function addSpy(
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      objects.forEach((object) => {
        if (object.userData.type === 'edge-visual') edgeVisuals.push(object);
      });
      return originalAdd.apply(this, objects);
    });

    await mountRenderer({}, { dataset: focusDataset, selectedEdgeId: 'selected' });
    await waitForFrames(2);

    const materials = edgeMaterialsById(edgeVisuals);
    expect(materials.get('selected')?.opacity).toBeGreaterThan(0.7);
    expect(materials.get('connected')?.opacity).toBeLessThan(0.06);
    expect(materials.get('unrelated')?.opacity).toBeLessThan(0.05);
  });

  it('dims incident edges when a high-degree node is selected', async () => {
    const hubDataset: GraphDataset = {
      generatedAt: 'node-focus-cap-test',
      nodes: [
        { id: 'hub', label: 'Hub', group: 'core', position: { x: 0, y: 0, z: 0 }, size: 12 },
        ...Array.from({ length: 50 }, (_, index) => ({
          id: `leaf-${index}`,
          label: `Leaf ${index}`,
          group: 'core',
          position: { x: 120 + index * 5, y: index % 2 ? 80 : -80, z: 0 },
          size: 6,
        })),
      ],
      edges: Array.from({ length: 50 }, (_, index) => ({
        id: `edge-${index}`,
        source: 'hub',
        target: `leaf-${index}`,
        weight: index / 49,
      })),
    };
    const edgeVisuals: THREE.Object3D[] = [];
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function addSpy(
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      objects.forEach((object) => {
        if (object.userData.type === 'edge-visual') edgeVisuals.push(object);
      });
      return originalAdd.apply(this, objects);
    });

    await mountRenderer({}, { dataset: hubDataset, renderMode: 'scale', selectedNodeId: 'hub' });
    await waitForFrames(2);

    const opacities = edgeVisuals.map((edge) => edgeMaterial(edge).opacity);
    expect(opacities.filter((opacity) => opacity > 0.5)).toHaveLength(14);
    expect(opacities.filter((opacity) => opacity < 0.06)).toHaveLength(36);
  });

  it('keeps relationship colors when edges are dimmed by node selection', async () => {
    const colorDataset: GraphDataset = {
      generatedAt: 'edge-highlight-color-test',
      nodes: [
        { id: 'hub', label: 'Hub', group: 'core', position: { x: 0, y: 0, z: 0 }, size: 12 },
        { id: 'red', label: 'Red', group: 'core', position: { x: 140, y: -50, z: 0 }, size: 7 },
        { id: 'blue', label: 'Blue', group: 'core', position: { x: 140, y: 50, z: 0 }, size: 7 },
      ],
      edges: [
        { id: 'red-edge', source: 'hub', target: 'red', weight: 0.9, color: '#ff0000' },
        { id: 'blue-edge', source: 'hub', target: 'blue', weight: 0.8, color: '#0000ff' },
      ],
    };
    const edgeVisuals: THREE.Object3D[] = [];
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function addSpy(
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      objects.forEach((object) => {
        if (object.userData.type === 'edge-visual') edgeVisuals.push(object);
      });
      return originalAdd.apply(this, objects);
    });

    await mountRenderer({}, { dataset: colorDataset, selectedNodeId: 'hub' });
    await waitForFrames(2);

    const materials = edgeMaterialsById(edgeVisuals);
    expect(materials.get('red-edge')?.color.r).toBeGreaterThan(0.9);
    expect(materials.get('red-edge')?.color.g).toBeLessThan(0.1);
    expect(materials.get('red-edge')?.color.b).toBeLessThan(0.1);
    expect(materials.get('blue-edge')?.color.r).toBeLessThan(0.1);
    expect(materials.get('blue-edge')?.color.g).toBeLessThan(0.1);
    expect(materials.get('blue-edge')?.color.b).toBeGreaterThan(0.9);
  });

  it('keeps node colors when connected nodes are highlighted', async () => {
    const colorDataset: GraphDataset = {
      generatedAt: 'node-highlight-color-test',
      nodes: [
        { id: 'hub', label: 'Hub', group: 'core', position: { x: 0, y: 0, z: 0 }, size: 12, color: '#ffffff' },
        { id: 'red', label: 'Red', group: 'core', position: { x: 140, y: -50, z: 0 }, size: 7, color: '#ff0000' },
        { id: 'blue', label: 'Blue', group: 'core', position: { x: 140, y: 50, z: 0 }, size: 7, color: '#0000ff' },
      ],
      edges: [
        { id: 'red-edge', source: 'hub', target: 'red', weight: 0.9 },
        { id: 'blue-edge', source: 'hub', target: 'blue', weight: 0.8 },
      ],
    };
    const pointClouds: THREE.Object3D[] = [];
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function addSpy(
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      objects.forEach((object) => {
        if (object.userData.type === 'node-points') pointClouds.push(object);
      });
      return originalAdd.apply(this, objects);
    });

    await mountRenderer({}, { dataset: colorDataset, selectedNodeId: 'hub' });
    await waitForFrames(2);

    const pointColors = pointColorsByIndex(pointClouds[0]);
    expect(pointColors[1][0]).toBeGreaterThan(pointColors[1][1]);
    expect(pointColors[1][0]).toBeGreaterThan(pointColors[1][2]);
    expect(pointColors[2][2]).toBeGreaterThan(pointColors[2][0]);
    expect(pointColors[2][2]).toBeGreaterThan(pointColors[2][1]);
  });

  it('appends streamed nodes and edges in place without rebuilding the scene', async () => {
    const onSceneReady = vi.fn();
    const { host } = await mountRenderer({ onSceneReady });
    const canvasBefore = getCanvas(host);
    expect(onSceneReady).toHaveBeenCalledTimes(1);

    // Append-only growth: reuse every existing node/edge object by reference and add
    // one new major node + one new edge on top (the shape mergeGraphDataset produces
    // during progressive/streamed loading).
    const appended: GraphDataset = {
      ...dataset,
      nodes: [
        ...dataset.nodes,
        {
          id: 'delta',
          label: 'Delta',
          group: 'core',
          major: true,
          color: '#c9a6ff',
          size: 10,
          position: { x: 120, y: -140, z: 180 },
        },
      ],
      edges: [
        ...dataset.edges,
        { id: 'links', source: 'hub', target: 'delta', label: 'links', weight: 0.7, color: '#c9a6ff' },
      ],
    };

    activeRenderer?.update({ ...rendererOptions(), dataset: appended });
    await waitForFrames(2);

    // Reusing the same canvas + WebGL context and never firing onSceneReady again
    // proves the scene was extended in place rather than disposed and rebuilt.
    expect(getCanvas(host)).toBe(canvasBefore);
    expect(onSceneReady).toHaveBeenCalledTimes(1);
    expect(getGalaxyRendererContextBudget().active).toBe(1);

    // The appended edge is now a real, selectable part of the runtime: selecting it
    // (a same-key patch, not a rebuild) surfaces its relationship label, which is only
    // possible if appendDataset actually wired the new node and edge into the scene.
    activeRenderer?.update({
      ...rendererOptions(),
      dataset: appended,
      accessors: {
        edgeLabel: (edge) => (edge.id === 'links' ? 'linked_by' : null),
        nodeLabel: (node) => `Display ${node.id}`,
      },
      selectedEdgeId: 'links',
    });

    await vi.waitFor(() => {
      expect(host.querySelector('.edge-label')?.textContent).toContain('Display hub -> linked by -> Display delta');
    });
  });

  it('matches the checked-in galaxy render baseline', async () => {
    const { host } = await mountRenderer();

    await waitForFrames(8);
    const actualBase64 = await page.screenshot({ element: host, save: false });
    const actual = await decodePng(actualBase64);
    expect(nonBackgroundPixelRatio(actual)).toBeGreaterThan(0.008);

    if (UPDATE_SCREENSHOTS) {
      await commands.writeFile(VISUAL_BASELINE_PATH, actualBase64, 'base64');
      return;
    }

    const expectedBase64 = await commands.readFile(VISUAL_BASELINE_PATH, 'base64');
    const expected = await decodePng(expectedBase64);
    expect(visualDiffRatio(actual, expected)).toBeLessThan(0.025);
  });

  it('renders a readable network light frame on a white background', async () => {
    const { host } = await mountRenderer({}, { renderMode: 'quality', theme: 'network-light' });

    await waitForFrames(8);
    const actualBase64 = await page.screenshot({ element: host, save: false });
    const actual = await decodePng(actualBase64);
    const [red, green, blue] = pixelRgb(actual, 4, 4);

    expect(red + green + blue).toBeGreaterThan(720);
    expect(nonWhitePixelRatio(actual)).toBeGreaterThan(0.001);
  });
});

async function mountRenderer(callbacks = {}, optionsOverride: Partial<GalaxyRendererOptions> = {}) {
  restoreRandom = useDeterministicRandom();
  await page.viewport(960, 640);
  const wrapper = document.createElement('div');
  wrapper.className = 'galaxy-nodes';
  wrapper.style.width = '720px';
  wrapper.style.height = '480px';
  wrapper.style.background = '#07090d';

  const host = document.createElement('div');
  host.className = 'galaxy-scene';
  host.style.width = '720px';
  host.style.height = '480px';
  wrapper.appendChild(host);
  document.body.appendChild(wrapper);

  activeRenderer = createGalaxyRenderer(host, { ...rendererOptions(), ...optionsOverride }, callbacks);
  await vi.waitFor(() => expect(host.querySelector('canvas')).not.toBeNull(), { timeout: 5_000 });
  await waitForFrames(4);
  return { host, wrapper };
}

function rendererOptions(): GalaxyRendererOptions {
  return {
    activeGroup: null,
    cameraCommand: null,
    dataset,
    galaxyMode: true,
    layout: false,
    motionPreference: 'reduced' as const,
    paused: true,
    selectedEdgeId: null,
    selectedNodeId: null,
    showClusters: true,
    theme: {
      background: '#07090d',
      panelAccentColor: '#46f4bc',
      selectedColor: '#d8fff3',
    },
  };
}

function getCanvas(host: HTMLElement) {
  const canvas = host.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Expected Galaxy Nodes to mount a WebGL canvas.');
  }
  return canvas;
}

function edgeMaterial(object: THREE.Object3D) {
  const material = (object as THREE.Mesh | THREE.LineSegments).material;
  if (!(material instanceof THREE.MeshBasicMaterial) && !(material instanceof THREE.LineBasicMaterial)) {
    throw new Error('Expected edge BasicMaterial.');
  }
  return material;
}

function pointMaterial(object: THREE.Object3D) {
  const material = (object as THREE.Points).material;
  if (!(material instanceof THREE.ShaderMaterial)) {
    throw new Error('Expected point ShaderMaterial.');
  }
  return material;
}

function pointsMaterial(object: THREE.Object3D) {
  const material = (object as THREE.Points).material;
  if (!(material instanceof THREE.PointsMaterial)) {
    throw new Error('Expected PointsMaterial.');
  }
  return material;
}

function edgeMaterialsById(objects: THREE.Object3D[]) {
  return new Map(objects.map((object) => [String(object.userData.edgeId), edgeMaterial(object)]));
}

function pointColorsByIndex(object: THREE.Object3D) {
  const geometry = (object as THREE.Points).geometry;
  const colorAttribute = geometry.getAttribute('color');
  if (!(colorAttribute instanceof THREE.BufferAttribute)) {
    throw new Error('Expected point color buffer attribute.');
  }
  return Array.from({ length: colorAttribute.count }, (_, index) => [
    colorAttribute.getX(index),
    colorAttribute.getY(index),
    colorAttribute.getZ(index),
  ]);
}

function waitForFrames(count: number) {
  return new Promise<void>((resolve) => {
    function step(remaining: number) {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    }
    step(count);
  });
}

function useDeterministicRandom() {
  const original = Math.random;
  let state = 0x9e3779b9;
  Math.random = () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return (state >>> 0) / 0x100000000;
  };
  return () => {
    Math.random = original;
  };
}

async function decodePng(base64: string) {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Expected 2D canvas context for visual regression diff.');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function nonBackgroundPixelRatio(image: ImageData) {
  let litPixels = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    if (red + green + blue > 44) litPixels += 1;
  }
  return litPixels / (image.width * image.height);
}

function nonWhitePixelRatio(image: ImageData) {
  let nonWhitePixels = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    if (red + green + blue < 735) nonWhitePixels += 1;
  }
  return nonWhitePixels / (image.width * image.height);
}

function pixelRgb(image: ImageData, x: number, y: number) {
  const offset = (y * image.width + x) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}

function visualDiffRatio(actual: ImageData, expected: ImageData) {
  expect(actual.width).toBe(expected.width);
  expect(actual.height).toBe(expected.height);

  let differentPixels = 0;
  for (let index = 0; index < actual.data.length; index += 4) {
    const redDelta = Math.abs(actual.data[index] - expected.data[index]);
    const greenDelta = Math.abs(actual.data[index + 1] - expected.data[index + 1]);
    const blueDelta = Math.abs(actual.data[index + 2] - expected.data[index + 2]);
    const alphaDelta = Math.abs(actual.data[index + 3] - expected.data[index + 3]);
    if (redDelta + greenDelta + blueDelta + alphaDelta > 48 && Math.max(redDelta, greenDelta, blueDelta) > 12) {
      differentPixels += 1;
    }
  }
  return differentPixels / (actual.width * actual.height);
}
