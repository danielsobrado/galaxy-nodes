# Galaxy Nodes

A reusable React + Three.js library for navigating dense graph data as a galaxy. It renders GPU point clouds, planet-like graph nodes, selectable relationships, sparse cluster labels, camera navigation, search focus, group filters, and hover/click inspection.

![Galaxy Nodes screenshot](docs/images/demo1_v0.1.jpg)

## Install

```bash
npm install galaxy-nodes three react react-dom
```

## Generic Usage

```tsx
import { GalaxyGraphVisualizer, type GraphAccessors, type GraphDataset } from 'galaxy-nodes';
import 'galaxy-nodes/styles.css';

interface PersonMeta {
  role: 'engineer' | 'designer';
}

const dataset: GraphDataset<PersonMeta> = {
  nodes: [
    {
      id: 'ada',
      label: 'Ada',
      group: 'team-a',
      major: true,
      meta: { role: 'engineer' },
    },
    {
      id: 'grace',
      label: 'Grace',
      group: 'team-a',
      meta: { role: 'designer' },
    },
  ],
  edges: [{ source: 'ada', target: 'grace', weight: 0.8 }],
};

const accessors: GraphAccessors<PersonMeta> = {
  nodeColor: (node) => (node.meta?.role === 'engineer' ? '#6bd7ff' : '#f5cf5b'),
  nodeLabel: (node) => node.label ?? node.id,
};

export function GraphView() {
  return (
    <GalaxyGraphVisualizer
      dataset={dataset}
      accessors={accessors}
      layout={{ seed: 'team-graph' }}
      renderNodeDetail={(node) => (
        <dl>
          <div>
            <dt>Role</dt>
            <dd>{node.meta?.role ?? 'Unknown'}</dd>
          </div>
        </dl>
      )}
    />
  );
}
```

Lower-level scene-only embedding is available through `GalaxyScene` when you want to provide your own HUD, panels, and data controls.

## Reduced Motion

Galaxy Nodes respects `prefers-reduced-motion` by default. With the default `motionPreference: 'system'`, ambient galaxy rotation, planet spin, and selection marker spin are paused for users who request reduced motion while direct interactions such as orbiting, keyboard navigation, search focus, and selection remain available.

Override the system preference only when your product has its own motion setting:

```tsx
<GalaxyGraphVisualizer dataset={dataset} options={{ motionPreference: 'reduced' }} />
```

Use `motionPreference: 'full'` to force ambient motion, or omit the option to follow the user's OS/browser preference.

## WebGL Fallback

If WebGL is unavailable, scene initialization fails, or the browser loses the WebGL context, the component renders an accessible fallback panel with dataset counts. Scene-only controls are disabled while the renderer is unavailable, and recoverable failures include a retry button.

```tsx
<GalaxyGraphVisualizer
  dataset={dataset}
  onSceneFailure={(failure) => {
    console.warn(failure.reason, failure.message);
  }}
/>
```

The failure reason is one of `'webgl-unavailable'`, `'context-lost'`, or `'scene-error'`.

## Next.js

Galaxy Nodes is a client-rendered React component. In the App Router, put the graph in a client component and import the stylesheet there or from a client-side wrapper:

```tsx
'use client';

import { GalaxyGraphVisualizer, type GraphDataset } from 'galaxy-nodes';
import 'galaxy-nodes/styles.css';

export function GraphClient({ dataset }: { dataset: GraphDataset }) {
  return <GalaxyGraphVisualizer dataset={dataset} />;
}
```

The package guards browser-only work so server rendering can safely encounter the component tree, but the WebGL scene starts only after hydration. For very large graphs, `next/dynamic(() => import('./GraphClient'), { ssr: false })` can still be useful to defer client bundle work; it is not required for correctness.

## Performance Envelope

The built-in renderer is tuned for sparse, large graph exploration:

- Target envelope: up to about 100k nodes and 500 sparse edges on a modern desktop GPU.
- Nodes are always kept in one GPU point cloud, including nodes marked `major`.
- Major nodes get a capped instanced planet/ring overlay for inspection; the point cloud still represents every node.
- Group filters, cluster toggles, galaxy mode, selection, theme changes, and accessor changes update existing buffers, uniforms, materials, and visibility in place instead of rebuilding the renderer.
- Dataset identity/topology changes and layout option changes can still rebuild the scene because they alter coordinates, lookup maps, and edge geometry.
- Edges use sparse TubeGeometry for visual quality. Dense edge graphs need a separate line-buffer or level-of-detail renderer.

For best results, keep the `dataset`, `layout`, and accessor objects stable with `useMemo` when their inputs have not changed.

## Layout

Coordinates are optional. When any node positions or cluster spatial fields are missing, Galaxy Nodes computes a deterministic 3D galaxy layout from stable node ids, node `group` values, and connected components. Authored node positions, cluster centers, and cluster radii are preserved by default.

```tsx
<GalaxyGraphVisualizer dataset={dataset} layout={{ seed: 'docs-demo', spacing: 320 }} />
```

Set `layout={false}` when you want strict pre-positioned data; missing positions then throw a clear error. The same resolver is exported for headless use:

```ts
import { resolveGraphLayout } from 'galaxy-nodes';

const resolved = resolveGraphLayout(dataset, { seed: 'docs-demo' });
const adaPosition = resolved.nodePositions.get('ada');
```

## Markets Preset

The original prediction-market demo is available as a preset, not part of the generic root module:

```tsx
import { GalaxyGraphVisualizer } from 'galaxy-nodes';
import {
  createMarketAccessors,
  generateGalaxyDataset,
  renderMarketEdgeDetail,
  renderMarketNodeDetail,
} from 'galaxy-nodes/presets/markets';
import 'galaxy-nodes/styles.css';

const dataset = generateGalaxyDataset(75_000);
const accessors = createMarketAccessors({ sharpMoney: true });

export function MarketGraph() {
  return (
    <GalaxyGraphVisualizer
      dataset={dataset}
      accessors={accessors}
      renderNodeDetail={renderMarketNodeDetail}
      renderEdgeDetail={renderMarketEdgeDetail}
    />
  );
}
```

## Dataset Shape

```ts
interface GraphDataset<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  nodes: GraphNode<NMeta>[];
  edges: GraphEdge<EMeta>[];
  clusters?: GraphCluster<CMeta>[];
  generatedAt?: string;
}

interface GraphNode<TMeta = unknown> {
  id: string;
  position?: { x: number; y: number; z: number };
  label?: string;
  size?: number;
  major?: boolean;
  group?: string;
  color?: string;
  meta?: TMeta;
}

interface GraphEdge<TMeta = unknown> {
  id?: string;
  source: string;
  target: string;
  weight?: number;
  kind?: string;
  color?: string;
  meta?: TMeta;
}

interface GraphCluster<TMeta = unknown> {
  id: string;
  label: string;
  center?: { x: number; y: number; z: number };
  radius?: number;
  group?: string;
  color?: string;
  meta?: TMeta;
}
```

`parseGraphDataset` validates untrusted JSON, accepts positionless nodes, rejects malformed provided coordinates, passes `meta` through untouched, defaults missing `clusters` to `[]`, and supplies `generatedAt` when absent.

Edges whose `source` and `target` match cluster ids render as large-scale galaxy filaments. Edges whose endpoints match node ids render as selectable graph relationships. Nodes marked `major` become interactive planet nodes.

## Develop

```bash
npm install
npm run dev
```

The dev server runs `examples/basic`, which imports the library through the package export path. Build the package and example separately:

```bash
npm run build
npm run build:example
```

Run the full contribution gate locally with:

```bash
npm run ci
```

API documentation is generated with TypeDoc:

```bash
npm run docs:api
```

Focused examples are in [docs/examples.md](docs/examples.md), covering a minimal graph, custom data shape, custom theme, scene-only/no-HUD usage, and Next.js client components. GitHub Actions builds the package, example app, tests, lint, format check, and generated API docs on every PR. The Pages workflow publishes the live demo and API docs from `main`.

## Memgraph Demo

This repo includes a Dockerized Memgraph demo in `demo/memgraph`.

```bash
cd demo/memgraph
docker compose up --build
```

That starts Memgraph Platform, seeds a graph dataset into Memgraph, and exposes a graph API on `http://localhost:8787/graph`. Run the example with `VITE_GRAPH_API_URL=http://127.0.0.1:8787`, then use the database button in the left toolbar to load nodes and relationships from Memgraph.
