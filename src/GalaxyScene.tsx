import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createGalaxyRenderer,
  type GalaxyRenderer,
  type GalaxyRendererCallbacks,
  type GalaxyRendererOptions,
} from './core';
import { createSceneFallbackViewModel, type GalaxySceneFailure } from './sceneFallback';
import type { GraphAccessors, GraphDataset, GraphEdge, GraphNode, SpaceDirection } from './types';

export type { CameraCommand, GalaxyGraphTheme, GalaxyMotionPreference, GalaxyPlanetSizingOptions } from './core';
export type { GalaxySceneFailure, GalaxySceneFailureReason } from './sceneFallback';

export interface GalaxySceneProps<NMeta = unknown, EMeta = unknown, CMeta = unknown> extends GalaxyRendererOptions<
  NMeta,
  EMeta,
  CMeta
> {
  onSceneFailure?: (failure: GalaxySceneFailure) => void;
  onSceneReady?: () => void;
  onSelectNode: (node: GraphNode<NMeta> | null) => void;
  onHoverNode: (node: GraphNode<NMeta> | null) => void;
  onSelectEdge: (edge: GraphEdge<EMeta> | null) => void;
  onHoverEdge: (edge: GraphEdge<EMeta> | null) => void;
}

export default function GalaxyScene<NMeta = unknown, EMeta = unknown, CMeta = unknown>({
  dataset,
  activeGroup,
  showClusters,
  galaxyMode,
  layout,
  accessors,
  theme,
  cameraCommand,
  motionPreference = 'system',
  onSceneFailure,
  onSceneReady,
  paused = false,
  planetSizing,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onHoverNode,
  onSelectEdge,
  onHoverEdge,
}: GalaxySceneProps<NMeta, EMeta, CMeta>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GalaxyRenderer<NMeta, EMeta, CMeta> | null>(null);
  const [failure, setFailure] = useState<GalaxySceneFailure | null>(null);

  const options = useMemo<GalaxyRendererOptions<NMeta, EMeta, CMeta>>(
    () => ({
      accessors,
      activeGroup,
      cameraCommand,
      dataset,
      galaxyMode,
      layout,
      motionPreference,
      paused,
      planetSizing,
      selectedEdgeId,
      selectedNodeId,
      showClusters,
      theme,
    }),
    [
      accessors,
      activeGroup,
      cameraCommand,
      dataset,
      galaxyMode,
      layout,
      motionPreference,
      paused,
      planetSizing,
      selectedEdgeId,
      selectedNodeId,
      showClusters,
      theme,
    ],
  );

  const callbacks = useMemo<GalaxyRendererCallbacks<NMeta, EMeta>>(
    () => ({
      onHoverEdge,
      onHoverNode,
      onSceneFailure: (nextFailure) => {
        setFailure(nextFailure);
        onSceneFailure?.(nextFailure);
      },
      onSceneReady: () => {
        setFailure(null);
        onSceneReady?.();
      },
      onSelectEdge,
      onSelectNode,
    }),
    [onHoverEdge, onHoverNode, onSceneFailure, onSceneReady, onSelectEdge, onSelectNode],
  );

  const optionsRef = useRef(options);
  const callbacksRef = useRef(callbacks);
  optionsRef.current = options;
  callbacksRef.current = callbacks;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const renderer = createGalaxyRenderer(host, optionsRef.current, callbacksRef.current);
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.update(options, callbacks);
  }, [callbacks, options]);

  const retryScene = useCallback(() => {
    setFailure(null);
    rendererRef.current?.retry();
  }, []);

  const fallback = failure ? createSceneFallbackViewModel(dataset, failure) : null;

  return (
    <div ref={hostRef} className="galaxy-scene">
      {fallback ? (
        <div className="scene-fallback" role="status" aria-live="polite">
          <div>
            <span>Graph renderer</span>
            <h2>{fallback.title}</h2>
            <p>{fallback.message}</p>
          </div>
          <dl>
            <div>
              <dt>Nodes</dt>
              <dd>{fallback.counts.nodes}</dd>
            </div>
            <div>
              <dt>Edges</dt>
              <dd>{fallback.counts.edges}</dd>
            </div>
            <div>
              <dt>Clusters</dt>
              <dd>{fallback.counts.clusters}</dd>
            </div>
          </dl>
          {fallback.canRetry ? (
            <button type="button" onClick={retryScene}>
              Retry renderer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type { GraphAccessors, GraphDataset, GraphEdge, GraphNode, SpaceDirection };
