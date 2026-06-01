# Focused Examples

These examples are intentionally small. They show the integration shapes people usually need before adopting a visualization package.

## Minimal Graph

```tsx
import { GalaxyGraphVisualizer, type GraphDataset } from 'galaxy-nodes';
import 'galaxy-nodes/styles.css';

const dataset: GraphDataset = {
  nodes: [
    { id: 'api', label: 'API', group: 'Services', major: true },
    { id: 'worker', label: 'Worker', group: 'Services' },
  ],
  edges: [{ source: 'api', target: 'worker', weight: 0.7 }],
};

export function MinimalGraph() {
  return <GalaxyGraphVisualizer dataset={dataset} layout={{ seed: 'minimal' }} />;
}
```

## Vanilla DOM Core

```ts
import { createGalaxyRenderer, type GraphDataset } from 'galaxy-nodes/core';
import 'galaxy-nodes/styles.css';

const dataset: GraphDataset = {
  nodes: [
    { id: 'api', label: 'API', group: 'Services', major: true },
    { id: 'worker', label: 'Worker', group: 'Services' },
  ],
  edges: [{ source: 'api', target: 'worker', weight: 0.7 }],
};

const renderer = createGalaxyRenderer(
  document.getElementById('graph')!,
  {
    dataset,
    activeGroup: null,
    showClusters: true,
    galaxyMode: true,
    cameraCommand: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    layout: { seed: 'vanilla' },
  },
  {
    onSelectNode: (node) => console.log(node?.id),
  },
);

window.addEventListener('beforeunload', () => renderer.dispose());
```

## Vue Core Adapter

This subpath is a Vue-named alias around the imperative core renderer; it does
not register Vue components or own lifecycle for you.

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { createGalaxyVueRenderer, type GalaxyRenderer, type GraphDataset } from 'galaxy-nodes/vue';
import 'galaxy-nodes/styles.css';

const host = ref<HTMLElement | null>(null);
let renderer: GalaxyRenderer | null = null;

const dataset: GraphDataset = {
  nodes: [{ id: 'api', label: 'API', group: 'Services', major: true }],
  edges: [],
};

onMounted(() => {
  if (!host.value) return;
  renderer = createGalaxyVueRenderer(host.value, {
    dataset,
    activeGroup: null,
    showClusters: true,
    galaxyMode: true,
    cameraCommand: null,
    selectedNodeId: null,
    selectedEdgeId: null,
  });
});

onBeforeUnmount(() => renderer?.dispose());
</script>

<template>
  <div ref="host" class="galaxy-scene" />
</template>
```

## Angular Core Adapter

This subpath is an Angular-named alias around the imperative core renderer; it
does not declare Angular components or own lifecycle for you.

```ts
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { createGalaxyAngularRenderer, type GalaxyRenderer, type GraphDataset } from 'galaxy-nodes/angular';
import 'galaxy-nodes/styles.css';

@Component({
  selector: 'app-graph',
  template: '<div #host class="galaxy-scene"></div>',
})
export class GraphComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;
  private renderer: GalaxyRenderer | null = null;

  private dataset: GraphDataset = {
    nodes: [{ id: 'api', label: 'API', group: 'Services', major: true }],
    edges: [],
  };

  ngAfterViewInit() {
    this.renderer = createGalaxyAngularRenderer(this.host.nativeElement, {
      dataset: this.dataset,
      activeGroup: null,
      showClusters: true,
      galaxyMode: true,
      cameraCommand: null,
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  }

  ngOnDestroy() {
    this.renderer?.dispose();
  }
}
```

## Custom Data Shape

```tsx
import { GalaxyGraphVisualizer, type GraphAccessors, type GraphDataset } from 'galaxy-nodes';

interface ServiceMeta {
  latencyMs: number;
  tier: 'frontend' | 'backend';
}

const dataset: GraphDataset<ServiceMeta> = {
  nodes: [
    { id: 'web', label: 'Web', group: 'Product', major: true, meta: { latencyMs: 42, tier: 'frontend' } },
    { id: 'api', label: 'API', group: 'Platform', meta: { latencyMs: 87, tier: 'backend' } },
  ],
  edges: [{ source: 'web', target: 'api', weight: 0.9 }],
};

const accessors: GraphAccessors<ServiceMeta> = {
  nodeColor: (node) => (node.meta?.tier === 'frontend' ? '#facc15' : '#38bdf8'),
  nodeSize: (node) => (node.meta?.latencyMs ?? 1) / 10,
};

export function TypedGraph() {
  return <GalaxyGraphVisualizer dataset={dataset} accessors={accessors} />;
}
```

## Custom Colors And Theme

`layout` controls coordinates only. Put palette rules, data-driven node and edge colors, labels, and sizes in `accessors`; put scene background and selection colors in `theme`.

```tsx
import { GalaxyGraphVisualizer, defaultNodeColor, type GraphAccessors, type GraphDataset } from 'galaxy-nodes';

const paletteByGroup: Record<string, string> = {
  Product: '#facc15',
  Platform: '#38bdf8',
  Security: '#fb7185',
};

const accessors: GraphAccessors = {
  nodeColor: (node) => node.color ?? paletteByGroup[node.group ?? ''] ?? defaultNodeColor(node),
  edgeColor: (edge) => edge.color ?? (edge.weight && edge.weight > 0.75 ? '#f5cf5b' : '#6bd7ff'),
};

export function StyledGraph({ dataset }: { dataset: GraphDataset }) {
  return (
    <GalaxyGraphVisualizer
      dataset={dataset}
      accessors={accessors}
      theme={{
        background: '#07090d',
        panelAccentColor: '#67e8c9',
        selectedColor: '#f8fafc',
      }}
    />
  );
}
```

## Scene Only / No HUD

Use `GalaxyScene` when your app owns the controls, panels, and selection state.

```tsx
import { useState } from 'react';
import { GalaxyScene, type CameraCommand, type GraphDataset, type GraphEdge, type GraphNode } from 'galaxy-nodes';

export function SceneOnly({ dataset }: { dataset: GraphDataset }) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [cameraCommand] = useState<CameraCommand | null>(null);

  return (
    <GalaxyScene
      dataset={dataset}
      activeGroup={null}
      showClusters
      galaxyMode
      cameraCommand={cameraCommand}
      selectedNodeId={selectedNode?.id ?? null}
      selectedEdgeId={selectedEdge?.id ?? null}
      onSelectNode={setSelectedNode}
      onHoverNode={() => undefined}
      onSelectEdge={setSelectedEdge}
      onHoverEdge={() => undefined}
    />
  );
}
```

## Next.js

Galaxy Nodes needs browser APIs, so load it from a client component.

```tsx
'use client';

import dynamic from 'next/dynamic';
import type { GraphDataset } from 'galaxy-nodes';
import 'galaxy-nodes/styles.css';

const GalaxyGraphVisualizer = dynamic(() => import('galaxy-nodes').then((module) => module.GalaxyGraphVisualizer), {
  ssr: false,
});

export function GalaxyNodesClient({ dataset }: { dataset: GraphDataset }) {
  return <GalaxyGraphVisualizer dataset={dataset} layout={{ seed: 'nextjs' }} />;
}
```
