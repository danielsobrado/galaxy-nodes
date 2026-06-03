import * as THREE from 'three';

export const MAX_STAR_COUNT = 2400;
export const QUIET_STAR_COUNT = 1100;
export const POINT_PICK_THRESHOLD = 22;
export const NODE_HIGHLIGHT_MARKER_LIMIT = 42;
export const NODE_HIGHLIGHT_FIRST_DEGREE_LIMIT = 18;
export const NODE_HIGHLIGHT_SECOND_DEGREE_LIMIT = 24;
export const SELECTED_NODE_RELATIONSHIP_LABEL_LIMIT = 18;
export const SELECTED_NODE_EDGE_FOCUS_LIMIT = 14;
// Factor applied to each RGB channel to dim points hidden by the active group filter.
export const DIMMED_POINT_COLOR_FACTOR = 0.36;
// Per-frame camera step for WASD/arrow movement (shift multiplies by KEY_SHIFT_BOOST).
export const KEY_MOVE_SPEED = 0.16;
export const KEY_MOVE_SPEED_VERTICAL = 0.13;
export const KEY_SHIFT_BOOST = 1.75;
// Per-frame world distance moved per WASD step before the speed multiplier above.
export const CAMERA_MOVE_DISTANCE = 80;

// ── Renderer, camera & controls ─────────────────────────────────────────────
// Cap devicePixelRatio so retina/4K panels don't quadruple the fragment cost.
export const MAX_PIXEL_RATIO = 1.75;
// ACES tone-mapping exposure; >1 lifts the additive glow without clipping highlights.
export const TONE_MAPPING_EXPOSURE = 0.92;
export const BLOOM_LAYER = 1;
// MSAA sample count for the final composer's render target. Rendering the scene through
// EffectComposer bypasses the canvas `antialias` flag (that only covers the default
// framebuffer), so without this the offscreen pass is aliased and thin edges shimmer
// while the camera moves. 0 disables (e.g. WebGL1, where it is ignored anyway).
export const RENDER_MSAA_SAMPLES = 4;
export const BLOOM_STRENGTH = 0.16;
export const BLOOM_RADIUS = 0.18;
// Layer-gated bloom only renders selected highlight objects, so no luminance cutoff is needed.
export const BLOOM_THRESHOLD = 0.0;
// Exponential fog density. Galaxy mode fogs harder so distant arms dissolve into the void.
export const FOG_DENSITY_GALAXY = 0.00068;
export const FOG_DENSITY_DEFAULT = 0.00042;
// Perspective frustum: wide-ish FOV, tight near plane, far plane past the star shell.
export const CAMERA_FOV = 58;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 7000;
// OrbitControls feel: low damping = floaty inertia; speeds tuned <1 to slow the defaults.
export const CONTROLS_DAMPING_FACTOR = 0.07;
export const CONTROLS_ROTATE_SPEED = 0.42;
export const CONTROLS_PAN_SPEED = 0.78;
export const CONTROLS_ZOOM_SPEED = 0.72;
export const CONTROLS_MIN_DISTANCE = 90;
export const CONTROLS_MAX_DISTANCE = 2700;

// ── Lighting (intensity, falloff distance) ──────────────────────────────────
export const AMBIENT_LIGHT_INTENSITY = 0.78;
export const KEY_LIGHT_INTENSITY = 1.45;
export const KEY_LIGHT_DISTANCE = 2400;
export const RIM_LIGHT_INTENSITY = 2.2;
export const RIM_LIGHT_DISTANCE = 1900;

// ── Planet sizing defaults (overridable via GalaxyPlanetSizingOptions) ───────
export const DEFAULT_PLANET_SIZE_MIN = 0.72;
export const DEFAULT_PLANET_SIZE_MAX = 2.15;
export const DEFAULT_PLANET_SIZE_STRENGTH = 0.82;

// ── Point cloud (every node drawn as an additive sprite) ─────────────────────
// Global multiplier for rendered node point sprites. Per-node `size`/`nodeSize`
// still controls relative differences; this makes the default node field read
// closer to the edge thickness without changing caller data.
export const DEFAULT_NODE_SIZE_SCALE = 1.22;
// Base point size before per-node size and distance attenuation; galaxy mode runs larger.
export const POINT_BASE_SIZE_GALAXY = 2.7;
export const POINT_BASE_SIZE_DEFAULT = 2.25;
// Floor (in device pixels) for a rendered point sprite. Points that shrink below ~1px
// flicker on and off as they cross pixel centres while the camera moves; keeping a
// minimum footprint trades a hair of extra glow for stable, non-blinking far points.
export const POINT_MIN_PIXEL_SIZE = 1.5;
// Adaptive density compensation. Additive node/edge blending sums to pure white where
// thousands of elements overlap, so per-element opacity is scaled down as the graph
// grows. Graphs at/below the reference count are untouched (the dense-but-not-blown-out
// look), and the scale tapers as sqrt(reference / count) but never below the floor.
export const DENSITY_REFERENCE_COUNT = 10000;
export const DENSITY_MIN_SCALE = 0.3;
// Size multiplier applied to a point by selection tier (selected / 1st-degree / 2nd-degree).
export const POINT_SIZE_SELECTED = 2.55;
export const POINT_SIZE_FIRST_DEGREE = 1.85;
export const POINT_SIZE_SECOND_DEGREE = 1.5;
// How strongly a highlighted point is tinted toward the accent/selected color (0..1 lerp).
export const POINT_FIRST_DEGREE_TINT = 0.74;
export const POINT_SECOND_DEGREE_TINT = 0.6;
// Color brightening applied to selected-node neighborhood points.
export const POINT_FIRST_DEGREE_BRIGHTEN = 1.36;
export const POINT_SECOND_DEGREE_BRIGHTEN = 1.18;
// Dimming applied to unrelated points while any node/edge is selected.
export const POINT_UNRELATED_DIM = 0.48;
// Selection focus is done by brightening the selected node + its edges (and dimming the
// non-connected edges), NOT by darkening the ambient field. Dimming the whole point
// cloud / starfield on selection made the backdrop visibly jump toward black, so these
// ambient multipliers are kept at 1 (no change). Per-node focus still comes from
// POINT_UNRELATED_DIM and per-edge focus from EDGE_OPACITY_UNRELATED_DIM.
export const SELECTION_POINT_OPACITY = 1.0;
export const FOCUS_STAR_DIM_FACTOR = 1.0;
export const FOCUS_CLUSTER_DIM_FACTOR = 1.0;
export const FOCUS_FOG_DENSITY_MULTIPLIER = 1.0;
// Distance focus around the selected node/edge, in graph-space units. The dim factor is
// 1 (disabled) so selecting does not darken everything away from the focus point.
export const FOCUS_DISTANCE_INNER = 190;
export const FOCUS_DISTANCE_OUTER = 760;
export const FOCUS_DISTANCE_DIM_FACTOR = 1.0;
// Point base color treatment: lerp toward the off-white tint, then a slight brighten.
export const POINT_COLOR_LERP = 0.12;
export const POINT_COLOR_BRIGHTEN = 1.02;
// Over-allocation when growing point buffers on incremental append: *factor then +pad.
export const POINT_CAPACITY_GROWTH_FACTOR = 1.5;
export const POINT_CAPACITY_GROWTH_PAD = 8;

// ── Background star shell ────────────────────────────────────────────────────
export const STAR_DISTANCE_MIN = 1600;
export const STAR_DISTANCE_SPAN = 2100;
export const STAR_VERTICAL_SPREAD = 900;
export const STAR_SIZE = 1.25;
export const STAR_OPACITY = 0.08;

// ── Cluster / planet / ring / image materials ────────────────────────────────
export const GLOW_SPRITE_OPACITY = 0.025;
// Cluster label floats this fraction of the cluster radius above its center.
export const CLUSTER_LABEL_HEIGHT_FACTOR = 0.85;
// Cluster glow sprite scale relative to its radius (galaxy mode blooms larger).
export const CLUSTER_SPRITE_SCALE_GALAXY = 1.18;
export const CLUSTER_SPRITE_SCALE_DEFAULT = 0.92;
export const PLANET_MATERIAL_OPACITY = 0.44;
export const RING_MATERIAL_OPACITY = 0.12;
export const NODE_IMAGE_SPRITE_OPACITY = 0.94;
export const NODE_IMAGE_MAX_ANISOTROPY = 4;
// Planet sphere radius per node = nodeSize * this, before the sizing multiplier.
export const PLANET_RADIUS_FACTOR = 0.68;
// Node image sprite scale = planetScale * this (floored so tiny planets stay legible).
export const NODE_IMAGE_SCALE_FACTOR = 1.82;
export const NODE_IMAGE_MIN_SCALE = 0.4;

// ── Node color helpers ───────────────────────────────────────────────────────
// dimColor: lerp toward the pale tint, then multiply down; default multiplier reused
// as the planet dim factor while a selection is active.
export const DIM_COLOR_LERP = 0.42;
export const DIM_COLOR_MULTIPLIER = 0.86;
// planetColor: whiten the node color by this much for the lit planet body.
export const PLANET_COLOR_WHITEN = 0.45;

// ── Selection / hover emphasis on major-node planets ─────────────────────────
// Planet scale bump by emphasis tier (selected > related/1st > 2nd > hovered > idle=1).
export const PLANET_SCALE_SELECTED = 1.38;
export const PLANET_SCALE_RELATED = 1.2;
export const PLANET_SCALE_SECOND_DEGREE = 1.14;
export const PLANET_SCALE_HOVERED = 1.1;
// Ring scale = radius * RING_SCALE_BASE * (per-tier factor below).
export const RING_SCALE_BASE = 1.42;
export const RING_SCALE_SELECTED = 1.42;
export const RING_SCALE_RELATED = 1.24;
export const RING_SCALE_SECOND_DEGREE = 1.14;
export const RING_SCALE_HOVERED = 1.08;
export const RING_SCALE_IDLE = 0.92;
// Hovered (but unselected) planets brighten their base color by this factor.
export const PLANET_HOVER_BRIGHTEN = 1.18;
// Planets get a deterministic per-instance yaw (index % cycle * step) so they don't
// all present the same face; rings reuse the cycle plus a fixed tilt to read as 3D.
export const PLANET_YAW_CYCLE = 16;
export const PLANET_YAW_STEP = 0.12;
export const RING_TILT_X = Math.PI * 0.55;
export const RING_TILT_Y = Math.PI * 0.1;
// Major-node label height = max(nodeSize * factor, radius * factor) above the node.
export const MAJOR_LABEL_NODE_SIZE_FACTOR = 1.85;
export const MAJOR_LABEL_RADIUS_FACTOR = 1.18;

// ── Label thinning (which major/cluster labels stay visible to avoid clutter) ─
export const MAJOR_LABEL_LIMIT_GROUPED = 12;
export const MAJOR_LABEL_LIMIT_TOP = 6;
export const MAJOR_LABEL_INTERVAL = 11;
export const CLUSTER_LABEL_LIMIT_GROUPED = 4;
export const CLUSTER_LABEL_INDEX_A = 3;
export const CLUSTER_LABEL_INDEX_B = 9;

// ── Endpoint & highlight markers ─────────────────────────────────────────────
// Marker layer opacity = base + strength(0..1) * span, per concentric layer.
export const MARKER_ATMOSPHERE_OPACITY_BASE = 0.02;
export const MARKER_ATMOSPHERE_OPACITY_SPAN = 0.05;
export const MARKER_CORE_OPACITY_BASE = 0.18;
export const MARKER_CORE_OPACITY_SPAN = 0.32;
export const MARKER_INNER_RING_OPACITY_BASE = 0.08;
export const MARKER_INNER_RING_OPACITY_SPAN = 0.22;
export const MARKER_OUTER_RING_OPACITY_BASE = 0.04;
export const MARKER_OUTER_RING_OPACITY_SPAN = 0.13;
// Marker layer scale relative to the (clamped) endpoint radius.
export const MARKER_MIN_SCALE = 24;
export const MARKER_ATMOSPHERE_SCALE = 0.34;
export const MARKER_CORE_SCALE = 0.3;
export const MARKER_INNER_RING_SCALE = 0.94;
export const MARKER_OUTER_RING_SCALE = 1.18;
// Hover ball: opacity, radius factor, and clamp range for its scale.
export const HOVER_BALL_OPACITY = 0.74;
export const HOVER_BALL_RADIUS_FACTOR = 0.9;
export const HOVER_BALL_MIN_SCALE = 6;
export const HOVER_BALL_MAX_SCALE = 72;
export const HOVER_BALL_SPIN = 0.004;
// Highlight-marker scale/strength for 1st-degree (level 2) vs 2nd-degree (level 1) nodes.
export const HIGHLIGHT_MARKER_SCALE_NEAR = 0.86;
export const HIGHLIGHT_MARKER_SCALE_FAR = 0.78;
export const HIGHLIGHT_MARKER_STRENGTH_NEAR = 0.72;
export const HIGHLIGHT_MARKER_STRENGTH_FAR = 0.54;
// Endpoint marker scale when the endpoint is the selected node vs. just an edge end.
export const ENDPOINT_MARKER_SCALE_PRIMARY = 1.34;
export const ENDPOINT_MARKER_SCALE_SECONDARY = 1.12;
// Node-marker label offset as fractions of the node radius (x to the side, y above),
// each floored to a minimum pixel offset so labels never overlap tiny nodes.
export const NODE_MARKER_LABEL_OFFSET_X = 0.68;
export const NODE_MARKER_LABEL_OFFSET_Y = 0.34;
export const NODE_MARKER_LABEL_MIN_X = 18;
export const NODE_MARKER_LABEL_MIN_Y = 8;
// Marker ring spin per frame in animated mode (base + per-marker-index stagger).
export const ENDPOINT_INNER_RING_SPIN = 0.006;
export const ENDPOINT_OUTER_RING_SPIN = 0.004;
export const ENDPOINT_RING_SPIN_STAGGER = 0.001;
export const HIGHLIGHT_INNER_RING_SPIN = 0.004;
export const HIGHLIGHT_OUTER_RING_SPIN = 0.0025;
export const HIGHLIGHT_RING_SPIN_STAGGER = 0.0002;

// ── Endpoint resolution (interaction hit radius of nodes & clusters) ──────────
export const ENDPOINT_MIN_RADIUS = 14;
export const ENDPOINT_PLANET_RADIUS_FACTOR = 1.35;
export const ENDPOINT_NODE_SIZE_FACTOR_MAJOR = 1.4;
export const ENDPOINT_NODE_SIZE_FACTOR_MINOR = 2.2;
export const CLUSTER_ENDPOINT_MIN_RADIUS = 28;
export const CLUSTER_ENDPOINT_RADIUS_FACTOR = 0.42;

// ── Edge geometry & appearance ───────────────────────────────────────────────
// Curve lift (how far the bezier control point bows up) and per-distance extra lift.
export const EDGE_CURVE_DEFAULT_LIFT = 50;
export const EDGE_CURVE_DISTANCE_LIFT = 0.04;
export const EDGE_MIDPOINT_LERP = 0.5;
// Filament edges (cluster-to-cluster gossamer) vs. weighted relationship edges.
export const EDGE_FILAMENT_LIFT_GALAXY = 86;
export const EDGE_FILAMENT_LIFT_DEFAULT = 38;
export const EDGE_LIFT_BASE = 24;
export const EDGE_LIFT_PER_WEIGHT = 42;
export const EDGE_FILAMENT_RADIUS = 0.3;
export const EDGE_RADIUS_BASE = 0.34;
export const EDGE_RADIUS_PER_WEIGHT = 0.34;
export const EDGE_FILAMENT_OPACITY_GALAXY = 0.078;
export const EDGE_FILAMENT_OPACITY_DEFAULT = 0.052;
export const EDGE_OPACITY_BASE = 0.075;
export const EDGE_OPACITY_PER_WEIGHT = 0.1;
// Selection-state opacity tiers for edges: cap = max final opacity, boost = base + boost.
export const EDGE_SELECTED_OPACITY_CAP = 0.86;
export const EDGE_SELECTED_OPACITY_BOOST = 0.56;
export const EDGE_HOVERED_OPACITY_CAP = 0.54;
export const EDGE_HOVERED_OPACITY_BOOST = 0.26;
export const EDGE_CONNECTED_OPACITY_CAP = 0.82;
export const EDGE_CONNECTED_OPACITY_BOOST = 0.52;
export const EDGE_UNRELATED_DIM = 0.28;
// Edge render-order tiers keep selected/hovered/connected edges above the ambient field.
export const EDGE_RENDER_ORDER_BASE = 0;
export const EDGE_RENDER_ORDER_CONNECTED = 16;
export const EDGE_RENDER_ORDER_HOVERED = 17;
export const EDGE_RENDER_ORDER_SELECTED = 18;
export const HOVER_EDGE_OVERLAY_RENDER_ORDER = 19;
export const EDGE_FILAMENT_VISUAL_SEGMENTS = 36;
export const EDGE_VISUAL_SEGMENTS = 28;
// Polyline segments per edge in scale (line) render mode. A sampled curve keeps the
// galaxy arc while costing ~EDGE_LINE_SEGMENTS*2 vertices/edge instead of the ~1k a
// tube needs, which is what makes large graphs (100k+ elements) fit in memory.
export const EDGE_LINE_SEGMENTS = 10;
// Switch the default ('auto') render mode from tube to line edges past this many total
// elements (nodes + edges). Measured from scripts/browser-perf.mjs: heap and max-frame
// stalls climb steeply beyond ~25k (359 MB / 583 ms at 25k -> 847 MB / 2433 ms at 100k).
export const SCALE_RENDER_ELEMENT_THRESHOLD = 24000;
export const EDGE_FILAMENT_HIT_SEGMENTS = 16;
export const EDGE_HIT_SEGMENTS = 18;
export const EDGE_FILAMENT_HIT_RADIUS = 10;
export const EDGE_HIT_RADIUS = 8;
// Hover-edge overlay: its own opacity and how much fatter than the base tube it draws.
export const HOVER_EDGE_OVERLAY_OPACITY = 0.34;
export const HOVER_EDGE_RADIUS_FACTOR = 1.85;

// ── Focus camera framing ─────────────────────────────────────────────────────
// focusNode offset = (nodeSize * scale + base) per axis, pulling the camera back & up.
export const FOCUS_NODE_OFFSET_X_SCALE = 6;
export const FOCUS_NODE_OFFSET_X_BASE = 60;
export const FOCUS_NODE_OFFSET_Y_SCALE = 5;
export const FOCUS_NODE_OFFSET_Y_BASE = 44;
export const FOCUS_NODE_OFFSET_Z_SCALE = 9;
export const FOCUS_NODE_OFFSET_Z_BASE = 150;
// focusEdge frames the midpoint; offset = (edgeLength * scale + base) per axis.
export const FOCUS_EDGE_MIN_DISTANCE = 160;
export const FOCUS_EDGE_OFFSET_XY_SCALE = 0.14;
export const FOCUS_EDGE_OFFSET_X_BASE = 90;
export const FOCUS_EDGE_OFFSET_Y_BASE = 82;
export const FOCUS_EDGE_OFFSET_Z_SCALE = 0.52;
export const FOCUS_EDGE_OFFSET_Z_BASE = 320;
// Hover label floats this fraction of the node radius above it (min 12 world units).
export const HOVER_LABEL_MIN_HEIGHT = 12;
export const HOVER_LABEL_HEIGHT_FACTOR = 0.72;

// ── Ambient animation ────────────────────────────────────────────────────────
// World auto-rotation per frame in full-motion galaxy mode (radians). Kept deliberately
// slow so the Motion toggle is visible without making dense additive edge fields crawl.
export const WORLD_ROTATION_SPEED = 0.000012;

// Shared scratch projection vector. Used by setLabelPosition (labels.ts) and the
// render loop in core.ts; kept here so both modules reference the same singleton.
export const tmpProjected = new THREE.Vector3();
