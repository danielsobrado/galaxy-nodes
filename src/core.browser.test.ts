import { page, commands, userEvent } from '@vitest/browser/context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGalaxyRenderer,
  getGalaxyRendererContextBudget,
  type GalaxyRenderer,
  type GalaxyRendererOptions,
} from './core';
import './styles.css';
import type { GraphDataset } from './types';

const VISUAL_BASELINE_PATH = 'src/__screenshots__/core-renderer-galaxy.png';
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
  document.body.innerHTML = '';
});

describe('createGalaxyRenderer in Chromium', () => {
  it('renders WebGL canvas, handles raycast hover/select, patches selection, and disposes cleanly', async () => {
    const onHoverNode = vi.fn();
    const onSelectNode = vi.fn();
    const onSelectEdge = vi.fn();
    const onSceneReady = vi.fn();
    const onSceneFailure = vi.fn();
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
        { id: 'delta', label: 'Delta', group: 'core', major: true, color: '#c9a6ff', size: 10, position: { x: 120, y: -140, z: 180 } },
      ],
      edges: [...dataset.edges, { id: 'links', source: 'hub', target: 'delta', label: 'links', weight: 0.7, color: '#c9a6ff' }],
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
});

async function mountRenderer(callbacks = {}) {
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

  activeRenderer = createGalaxyRenderer(host, rendererOptions(), callbacks);
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
