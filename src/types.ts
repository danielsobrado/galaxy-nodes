export type SpaceDirection = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GalaxyCameraView {
  direction: Vec3;
  position: Vec3;
  right: Vec3;
  target: Vec3;
  up: Vec3;
}

/**
 * A renderable graph node. Only `id` is required; if `position` is omitted the
 * built-in layout generates a stable 3D coordinate. Everything else is optional
 * and resolved through {@link GraphAccessors} so the engine stays domain-free.
 * Attach any domain payload (scores, metrics, tags, ...) to `meta` and read it
 * back in your accessors and detail renderers.
 */
export interface GraphNode<TMeta = unknown> {
  id: string;
  position?: Vec3;
  /** Display name shown in the detail panel heading. */
  label?: string;
  /** Optional display name; used as a display fallback when `label` is absent. */
  name?: string;
  /** Optional node type label; useful when imported data stores names under type. */
  type?: string;
  /** World-space size; the renderer defaults to 1. */
  size?: number;
  /** Major nodes render as interactive "planets" with labels. */
  major?: boolean;
  /** Grouping / filter key used by the category nav and cluster association. */
  group?: string;
  /** Explicit color override; wins over the accessor default. */
  color?: string;
  /**
   * Optional image URL rendered on the node's planet overlay.
   *
   * The renderer loads this URL as a WebGL texture with `crossOrigin: 'anonymous'`.
   * Treat values as consumer-supplied remote content: validate
   * allowed origins in your host app and allow those origins in CSP `img-src`.
   */
  image?: string;
  /** Opt-in orbit/donut ring around this node. Defaults to false. */
  ring?: boolean;
  /** Arbitrary domain payload. */
  meta?: TMeta;
}

export interface GraphEdge<TMeta = unknown> {
  id?: string;
  /** Optional display label for relationship overlays and detail UIs. */
  label?: string;
  /** Optional relationship name; used as a display fallback when `label` is absent. */
  name?: string;
  source: string;
  target: string;
  /** Optional relationship type label; `kind` remains the canonical styling key. */
  type?: string;
  /** Relationship strength in the 0..1 range; the renderer defaults to 0.5. */
  weight?: number;
  /** `'filament'` renders as a faint large-scale strand; anything else is a relationship. */
  kind?: string;
  color?: string;
  meta?: TMeta;
}

export interface GraphCluster<TMeta = unknown> {
  id: string;
  label: string;
  center?: Vec3;
  radius?: number;
  /** Grouping / filter key; matched against the active group like nodes. */
  group?: string;
  color?: string;
  meta?: TMeta;
}

export interface GraphDataset<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  nodes: GraphNode<NMeta>[];
  edges: GraphEdge<EMeta>[];
  clusters?: GraphCluster<CMeta>[];
  /** Optional dataset version/timestamp; parsed JSON imports are normalized. */
  generatedAt?: string;
}

export interface GraphDatasetPatch<NMeta = unknown, EMeta = unknown, CMeta = unknown> {
  nodes?: GraphNode<NMeta>[];
  edges?: GraphEdge<EMeta>[];
  clusters?: GraphCluster<CMeta>[];
  generatedAt?: string;
}

/**
 * Functions the renderer uses to derive visual properties from your nodes and
 * edges. All are optional - `resolveAccessors` fills in sensible defaults
 * that read the core fields (`color`, `size`, `label`, `group`).
 */
export interface GraphAccessors<NMeta = unknown, EMeta = unknown> {
  /** Color for a node's point/planet (any CSS color string). */
  nodeColor?: (node: GraphNode<NMeta>) => string;
  /** Render size for a node. */
  nodeSize?: (node: GraphNode<NMeta>) => number;
  /** Floating planet label; return `null` to hide it. */
  nodeLabel?: (node: GraphNode<NMeta>) => string | null;
  /**
   * Optional planet image URL; useful for type-based icons or thumbnails.
   *
   * The renderer loads this URL as a WebGL texture with `crossOrigin: 'anonymous'`.
   * Treat values as consumer-supplied remote content: validate
   * allowed origins in your host app and allow those origins in CSP `img-src`.
   */
  nodeImage?: (node: GraphNode<NMeta>) => string | null;
  /** Whether this node should render the optional orbit/donut ring. */
  nodeRing?: (node: GraphNode<NMeta>) => boolean;
  /** Color for an edge. */
  edgeColor?: (edge: GraphEdge<EMeta>) => string;
  /** Relationship display label used for hover, selected-line labels, and default detail text. */
  edgeLabel?: (edge: GraphEdge<EMeta>) => string | null;
  /** Strength in the 0..1 range, driving edge thickness/opacity. */
  edgeWeight?: (edge: GraphEdge<EMeta>) => number;
}

/** Every accessor populated - what the renderer actually consumes. */
export type ResolvedAccessors<NMeta = unknown, EMeta = unknown> = Required<GraphAccessors<NMeta, EMeta>>;

/** A resolved edge endpoint (a node or a cluster), passed to edge detail renderers. */
export interface EdgeEndpoint<NMeta = unknown> {
  id: string;
  label: string;
  group?: string;
  isNode: boolean;
  node: GraphNode<NMeta> | null;
}
