import {
  DEFAULT_PLANET_SIZE_MAX,
  DEFAULT_PLANET_SIZE_MIN,
  DEFAULT_PLANET_SIZE_STRENGTH,
  DEFAULT_NODE_SIZE_SCALE,
  DENSITY_MIN_SCALE,
  DENSITY_REFERENCE_COUNT,
  SCALE_RENDER_ELEMENT_THRESHOLD,
} from './sceneConstants';
import type { PlanetSizingMode, ResolvedPlanetSizing } from './sceneData';

export type GalaxyRenderMode = 'auto' | 'quality' | 'scale';
export type EdgeRenderMode = 'tube' | 'line';
export type GalaxyGraphThemeId = 'galaxy-dark' | 'network-light';
export type GalaxyGraphThemeMode = 'dark' | 'light';
export type GalaxyGraphDataColorStrategy = 'data' | 'theme';
export type GalaxyGraphPointStyle = 'glow' | 'disc';
export type GalaxyGraphBlendMode = 'additive' | 'normal';
export type GalaxyGraphToneMapping = 'aces' | 'none';

export interface GalaxyPlanetSizingOptions {
  /** `degree` uses all links, `incoming` uses target links, `outgoing` uses source links, `accessor` uses nodeSize only. */
  mode?: PlanetSizingMode;
  /** Multiplier applied to the final planet radius. */
  scale?: number;
  /** Lower visual multiplier for degree-based sizing. */
  min?: number;
  /** Upper visual multiplier for degree-based sizing. */
  max?: number;
  /** Higher values make hubs separate more strongly from low-degree nodes. */
  strength?: number;
}

export interface GalaxyGraphTheme {
  id?: string;
  label?: string;
  mode?: GalaxyGraphThemeMode;
  dataColorStrategy?: GalaxyGraphDataColorStrategy;
  background?: string;
  panelAccentColor?: string;
  selectedColor?: string;
  chrome?: Partial<GalaxyGraphThemeChrome>;
  scene?: Partial<GalaxyGraphThemeScene>;
}

export type GalaxyGraphThemeInput = GalaxyGraphThemeId | GalaxyGraphTheme;

export interface GalaxyGraphThemeChoice {
  id: GalaxyGraphThemeId | string;
  label: string;
  theme?: GalaxyGraphThemeInput;
}

export interface GalaxyGraphThemeChrome {
  textColor: string;
  mutedTextColor: string;
  panelBackground: string;
  panelBorder: string;
  panelShadow: string;
  controlBackground: string;
  controlHoverBackground: string;
  controlActiveBackground: string;
  controlBorder: string;
  toolbarBackground: string;
  ribbonBackground: string;
  sceneVignette: string;
}

export interface GalaxyGraphThemeScene {
  fogColor: string;
  fogDensityScale: number;
  starColor: string;
  starOpacity: number;
  starFocusOpacityMultiplier: number;
  clusterOpacity: number;
  clusterFocusOpacityMultiplier: number;
  pointStyle: GalaxyGraphPointStyle;
  pointColor: string;
  pointSelectedColor: string;
  pointFirstDegreeColor: string;
  pointSecondDegreeColor: string;
  pointDimMultiplier: number;
  pointOpacity: number;
  pointStrokeColor: string;
  pointStrokeOpacity: number;
  pointCoreBoost: number;
  pointBlending: GalaxyGraphBlendMode;
  edgeColor: string;
  filamentColor: string;
  edgeOpacityMultiplier: number;
  edgeSelectedColor: string;
  edgeHoverColor: string;
  edgeConnectedColor: string;
  edgeBlending: GalaxyGraphBlendMode;
  hoverEdgeOpacity: number;
  planetOpacity: number;
  ringOpacity: number;
  planetBlending: GalaxyGraphBlendMode;
  markerBlending: GalaxyGraphBlendMode;
  markerOpacityScale: number;
  toneMapping: GalaxyGraphToneMapping;
}

export interface ResolvedGalaxyGraphTheme {
  id: string;
  label: string;
  mode: GalaxyGraphThemeMode;
  dataColorStrategy: GalaxyGraphDataColorStrategy;
  background: string;
  panelAccentColor: string;
  selectedColor: string;
  chrome: GalaxyGraphThemeChrome;
  scene: GalaxyGraphThemeScene;
}

const DEFAULT_PLANET_SIZING: ResolvedPlanetSizing = {
  mode: 'accessor',
  scale: 1,
  min: DEFAULT_PLANET_SIZE_MIN,
  max: DEFAULT_PLANET_SIZE_MAX,
  strength: DEFAULT_PLANET_SIZE_STRENGTH,
};

const GALAXY_DARK_THEME: ResolvedGalaxyGraphTheme = {
  id: 'galaxy-dark',
  label: 'Galaxy dark',
  mode: 'dark',
  dataColorStrategy: 'data',
  background: '#000000',
  panelAccentColor: '#46f4bc',
  selectedColor: '#ffffff',
  chrome: {
    textColor: '#f2f6f4',
    mutedTextColor: 'rgba(245, 249, 247, 0.56)',
    panelBackground: 'rgba(3, 5, 7, 0.78)',
    panelBorder: 'rgba(255, 255, 255, 0.08)',
    panelShadow: '0 28px 90px rgba(0, 0, 0, 0.42)',
    controlBackground: 'rgba(255, 255, 255, 0.055)',
    controlHoverBackground: 'rgba(255, 255, 255, 0.1)',
    controlActiveBackground: 'rgba(255, 255, 255, 0.1)',
    controlBorder: 'rgba(255, 255, 255, 0.07)',
    toolbarBackground: 'rgba(3, 5, 7, 0.78)',
    ribbonBackground: 'rgba(5, 7, 10, 0.58)',
    sceneVignette:
      'radial-gradient(ellipse at center, transparent 48%, rgba(0, 0, 0, 0.3) 76%, rgba(0, 0, 0, 0.68) 100%)',
  },
  scene: {
    fogColor: '#090b11',
    fogDensityScale: 1,
    starColor: '#b8c9d9',
    starOpacity: 0.08,
    starFocusOpacityMultiplier: 1,
    clusterOpacity: 0.025,
    clusterFocusOpacityMultiplier: 1,
    pointStyle: 'glow',
    pointColor: '#6bd7ff',
    pointSelectedColor: '#ffffff',
    pointFirstDegreeColor: '#d8fff3',
    pointSecondDegreeColor: '#46f4bc',
    pointDimMultiplier: 0.48,
    pointOpacity: 1,
    pointStrokeColor: '#ffffff',
    pointStrokeOpacity: 0,
    pointCoreBoost: 0.72,
    pointBlending: 'additive',
    edgeColor: '#6bd7ff',
    filamentColor: '#aeb8c2',
    edgeOpacityMultiplier: 1,
    edgeSelectedColor: '#ffffff',
    edgeHoverColor: '#46f4bc',
    edgeConnectedColor: '#46f4bc',
    edgeBlending: 'additive',
    hoverEdgeOpacity: 0.34,
    planetOpacity: 0.44,
    ringOpacity: 0.12,
    planetBlending: 'additive',
    markerBlending: 'additive',
    markerOpacityScale: 1,
    toneMapping: 'aces',
  },
};

const NETWORK_LIGHT_THEME: ResolvedGalaxyGraphTheme = {
  ...GALAXY_DARK_THEME,
  id: 'network-light',
  label: 'Network light',
  mode: 'light',
  dataColorStrategy: 'data',
  background: '#ffffff',
  panelAccentColor: '#2f80a8',
  selectedColor: '#ffffff',
  chrome: {
    textColor: '#162331',
    mutedTextColor: 'rgba(22, 35, 49, 0.62)',
    panelBackground: 'rgba(255, 255, 255, 0.86)',
    panelBorder: 'rgba(20, 44, 62, 0.14)',
    panelShadow: '0 18px 60px rgba(20, 44, 62, 0.16)',
    controlBackground: 'rgba(20, 44, 62, 0.055)',
    controlHoverBackground: 'rgba(47, 128, 168, 0.1)',
    controlActiveBackground: 'rgba(47, 128, 168, 0.14)',
    controlBorder: 'rgba(20, 44, 62, 0.13)',
    toolbarBackground: 'rgba(255, 255, 255, 0.82)',
    ribbonBackground: 'rgba(255, 255, 255, 0.62)',
    sceneVignette: 'none',
  },
  scene: {
    fogColor: '#ffffff',
    fogDensityScale: 0,
    starColor: '#ffffff',
    starOpacity: 0,
    starFocusOpacityMultiplier: 1,
    clusterOpacity: 0,
    clusterFocusOpacityMultiplier: 1,
    pointStyle: 'disc',
    pointColor: '#5f9fc0',
    pointSelectedColor: '#ffffff',
    pointFirstDegreeColor: '#7eb5cf',
    pointSecondDegreeColor: '#2f80a8',
    pointDimMultiplier: 0.72,
    pointOpacity: 0.96,
    pointStrokeColor: '#17304a',
    pointStrokeOpacity: 0.92,
    pointCoreBoost: 0,
    pointBlending: 'normal',
    edgeColor: '#3d6d8a',
    filamentColor: '#6a94ad',
    edgeOpacityMultiplier: 1,
    edgeSelectedColor: '#111827',
    edgeHoverColor: '#2f80a8',
    edgeConnectedColor: '#4c95b8',
    edgeBlending: 'normal',
    hoverEdgeOpacity: 0.3,
    planetOpacity: 0.9,
    ringOpacity: 0.28,
    planetBlending: 'normal',
    markerBlending: 'normal',
    markerOpacityScale: 0.8,
    toneMapping: 'none',
  },
};

export const GALAXY_GRAPH_THEMES = {
  'galaxy-dark': GALAXY_DARK_THEME,
  'network-light': NETWORK_LIGHT_THEME,
} as const satisfies Record<GalaxyGraphThemeId, ResolvedGalaxyGraphTheme>;

export const GALAXY_GRAPH_THEME_CHOICES: readonly GalaxyGraphThemeChoice[] = [
  { id: 'galaxy-dark', label: GALAXY_GRAPH_THEMES['galaxy-dark'].label },
  { id: 'network-light', label: GALAXY_GRAPH_THEMES['network-light'].label },
];

function mergeTheme(base: ResolvedGalaxyGraphTheme, theme: GalaxyGraphTheme): ResolvedGalaxyGraphTheme {
  const next = {
    ...base,
    ...theme,
    id: theme.id ?? base.id,
    label: theme.label ?? base.label,
    mode: theme.mode ?? base.mode,
    dataColorStrategy: theme.dataColorStrategy ?? base.dataColorStrategy,
    background: theme.background ?? base.background,
    panelAccentColor: theme.panelAccentColor ?? base.panelAccentColor,
    selectedColor: theme.selectedColor ?? base.selectedColor,
    chrome: {
      ...base.chrome,
      ...theme.chrome,
    },
    scene: {
      ...base.scene,
      ...theme.scene,
    },
  };
  return next;
}

export function resolveGalaxyGraphTheme(theme?: GalaxyGraphThemeInput): ResolvedGalaxyGraphTheme {
  if (!theme) return GALAXY_GRAPH_THEMES['galaxy-dark'];
  if (typeof theme === 'string') return GALAXY_GRAPH_THEMES[theme] ?? GALAXY_GRAPH_THEMES['galaxy-dark'];

  const base =
    theme.id && theme.id in GALAXY_GRAPH_THEMES
      ? GALAXY_GRAPH_THEMES[theme.id as GalaxyGraphThemeId]
      : GALAXY_GRAPH_THEMES['galaxy-dark'];
  return mergeTheme(base, theme);
}

export function galaxyGraphThemeCssVariables(theme: ResolvedGalaxyGraphTheme): Record<string, string> {
  const light = theme.mode === 'light';
  return {
    '--gn-bg': theme.background,
    '--gn-text': theme.chrome.textColor,
    '--gn-muted': theme.chrome.mutedTextColor,
    '--gn-no': light ? '#b91c1c' : '#ff6f86',
    '--gn-yes': light ? theme.panelAccentColor : '#46f4bc',
    '--gn-panel-bg': theme.chrome.panelBackground,
    '--gn-panel-border': theme.chrome.panelBorder,
    '--gn-panel-shadow': theme.chrome.panelShadow,
    '--gn-control-bg': theme.chrome.controlBackground,
    '--gn-control-hover-bg': theme.chrome.controlHoverBackground,
    '--gn-control-active-bg': theme.chrome.controlActiveBackground,
    '--gn-control-border': theme.chrome.controlBorder,
    '--gn-toolbar-bg': theme.chrome.toolbarBackground,
    '--gn-ribbon-bg': theme.chrome.ribbonBackground,
    '--gn-scene-vignette': theme.chrome.sceneVignette,
    '--gn-scene-inset-shadow': light ? 'none' : 'inset 0 0 190px rgba(0, 0, 0, 0.56)',
    '--gn-label-color': light ? 'rgba(20, 44, 62, 0.86)' : 'rgba(250, 255, 251, 0.92)',
    '--gn-label-shadow': light
      ? '0 1px 0 rgba(255, 255, 255, 0.86)'
      : '0 0 16px rgba(255, 255, 255, 0.82), 0 0 34px rgba(99, 230, 190, 0.58)',
    '--gn-label-stroke': light ? 'rgba(255, 255, 255, 0.78)' : 'rgba(0, 0, 0, 0.62)',
    '--gn-label-panel-bg': light ? 'rgba(255, 255, 255, 0.78)' : 'rgba(3, 5, 7, 0.72)',
    '--gn-label-underline-bg': light ? 'rgba(47, 128, 168, 0.42)' : 'rgba(237, 244, 241, 0.78)',
    '--gn-label-underline-shadow': light ? '0 1px 4px rgba(47, 128, 168, 0.22)' : '0 0 14px rgba(99, 230, 190, 0.56)',
    '--gn-highlight-border': light ? 'rgba(47, 128, 168, 0.68)' : 'rgba(70, 244, 188, 0.8)',
    '--gn-highlight-subtle-border': light ? 'rgba(126, 181, 207, 0.7)' : 'rgba(216, 255, 243, 0.68)',
    '--gn-highlight-gradient-end': 'rgba(255, 255, 255, 0)',
    '--gn-highlight-shadow': light ? '0 8px 24px rgba(20, 44, 62, 0.12)' : '0 0 18px rgba(70, 244, 188, 0.24)',
    '--gn-edge-label-border': light ? 'rgba(20, 44, 62, 0.22)' : 'rgba(255, 255, 255, 0.58)',
    '--gn-edge-label-shadow': light
      ? '0 10px 28px rgba(20, 44, 62, 0.16)'
      : '0 0 18px rgba(255, 255, 255, 0.42), 0 0 28px rgba(70, 244, 188, 0.22)',
    '--gn-relationship-label-border': light ? 'rgba(47, 128, 168, 0.34)' : 'rgba(70, 244, 188, 0.5)',
    '--gn-relationship-label-shadow': light
      ? '0 8px 22px rgba(20, 44, 62, 0.12)'
      : '0 0 15px rgba(70, 244, 188, 0.34), 0 0 24px rgba(255, 255, 255, 0.18)',
    '--gn-hover-label-border': light ? 'rgba(47, 128, 168, 0.36)' : 'rgba(70, 244, 188, 0.42)',
    '--gn-hover-label-shadow': light
      ? '0 10px 24px rgba(20, 44, 62, 0.13)'
      : '0 0 14px rgba(70, 244, 188, 0.26), 0 0 22px rgba(255, 255, 255, 0.18)',
    '--gn-toolbar-border': light ? 'rgba(20, 44, 62, 0.1)' : 'rgba(255, 255, 255, 0.06)',
    '--gn-ribbon-border': light ? 'rgba(20, 44, 62, 0.08)' : 'rgba(255, 255, 255, 0.045)',
    '--gn-brand-icon-filter': light ? 'none' : 'drop-shadow(0 0 10px rgba(70, 244, 188, 0.8))',
    '--gn-brand-badge': light ? '#8a5a00' : '#f5cf5b',
    '--gn-fallback-stat-bg': light ? 'rgba(20, 44, 62, 0.055)' : 'rgba(255, 255, 255, 0.055)',
    '--gn-fallback-button-ring': light ? 'rgba(47, 128, 168, 0.28)' : 'rgba(70, 244, 188, 0.28)',
    '--gn-active-ring': light ? 'rgba(47, 128, 168, 0.34)' : 'rgba(70, 244, 188, 0.34)',
    '--gn-active-glow': light ? '0 8px 20px rgba(47, 128, 168, 0.1)' : '0 0 22px rgba(70, 244, 188, 0.12)',
    '--gn-error-ring': light ? 'rgba(185, 28, 28, 0.32)' : 'rgba(255, 111, 134, 0.32)',
    '--gn-hover-panel-border': light ? 'rgba(47, 128, 168, 0.24)' : 'rgba(70, 244, 188, 0.24)',
    '--gn-hover-panel-shadow': light
      ? '0 18px 54px rgba(20, 44, 62, 0.16)'
      : '0 22px 70px rgba(0, 0, 0, 0.36), 0 0 28px rgba(70, 244, 188, 0.16)',
    '--gn-panel-accent': theme.panelAccentColor,
    '--gn-selected': theme.selectedColor,
    '--gn-legend-rel-color': light ? 'rgba(22, 35, 49, 0.86)' : 'rgba(245, 249, 247, 0.74)',
    '--gn-legend-sep-color': light ? 'rgba(20, 44, 62, 0.24)' : 'rgba(245, 249, 247, 0.18)',
    '--gn-legend-swatch-shadow': light ? 'none' : '0 0 6px var(--rel)',
  };
}

/**
 * Pick the edge render tier. Honors an explicit `renderMode`, otherwise compares the
 * larger of the declared `expectedSize` and the current element count against the
 * measured scale threshold (see scripts/browser-perf.mjs).
 */
export function resolveEdgeRenderMode(
  nodeCount: number,
  edgeCount: number,
  expectedSize: number | undefined,
  renderMode: GalaxyRenderMode | undefined,
): EdgeRenderMode {
  if (renderMode === 'quality') return 'tube';
  if (renderMode === 'scale') return 'line';
  const elements = Math.max(expectedSize ?? 0, nodeCount + edgeCount);
  return elements >= SCALE_RENDER_ELEMENT_THRESHOLD ? 'line' : 'tube';
}

/**
 * Adaptive per-element opacity multiplier that keeps dense scenes from saturating
 * to white. Returns 1 at or below `DENSITY_REFERENCE_COUNT`, then tapers as
 * sqrt(reference / count), floored at `DENSITY_MIN_SCALE`.
 */
export function resolveDensityScale(count: number): number {
  if (count <= DENSITY_REFERENCE_COUNT) return 1;
  return Math.max(DENSITY_MIN_SCALE, Math.min(1, Math.sqrt(DENSITY_REFERENCE_COUNT / count)));
}

export function resolveNodeSizeScale(nodeSizeScale: number | undefined): number {
  return typeof nodeSizeScale === 'number' && Number.isFinite(nodeSizeScale) && nodeSizeScale > 0
    ? nodeSizeScale
    : DEFAULT_NODE_SIZE_SCALE;
}

export function resolvePlanetSizing(planetSizing?: GalaxyPlanetSizingOptions): ResolvedPlanetSizing {
  return {
    ...DEFAULT_PLANET_SIZING,
    ...planetSizing,
  };
}
