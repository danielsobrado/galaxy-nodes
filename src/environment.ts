export type GalaxyMotionPreference = 'system' | 'full' | 'reduced';
export type ResolvedGalaxyMotion = 'full' | 'reduced';

export function canUseDOM() {
  return (
    typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function'
  );
}

export function resolveMotionPreference(preference: GalaxyMotionPreference = 'system'): ResolvedGalaxyMotion {
  if (preference === 'full') return 'full';
  if (preference === 'reduced') return 'reduced';
  if (!canUseDOM() || typeof window.matchMedia !== 'function') return 'full';

  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
  } catch {
    return 'full';
  }
}

export interface WebGLAvailability {
  available: boolean;
  message?: string;
}

const DEFAULT_WEBGL_CONTEXT_LIMIT = 12;
let activeGalaxyRendererContexts = 0;

export interface GalaxyRendererContextBudget {
  active: number;
  limit: number;
  remaining: number;
}

export function getGalaxyRendererContextBudget(limit = DEFAULT_WEBGL_CONTEXT_LIMIT): GalaxyRendererContextBudget {
  return {
    active: activeGalaxyRendererContexts,
    limit,
    remaining: Math.max(0, limit - activeGalaxyRendererContexts),
  };
}

export function reserveGalaxyRendererContext(limit = DEFAULT_WEBGL_CONTEXT_LIMIT): (() => void) | null {
  if (activeGalaxyRendererContexts >= limit) return null;
  activeGalaxyRendererContexts += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeGalaxyRendererContexts = Math.max(0, activeGalaxyRendererContexts - 1);
  };
}

export function resetGalaxyRendererContextBudgetForTests() {
  activeGalaxyRendererContexts = 0;
}

export function detectWebGLAvailability(): WebGLAvailability {
  if (!canUseDOM()) {
    return { available: false, message: 'This environment does not provide a browser DOM.' };
  }

  try {
    const canvas = document.createElement('canvas');
    const getContext = canvas.getContext.bind(canvas) as (contextId: string) => unknown;
    const context = getContext('webgl2') ?? getContext('webgl') ?? getContext('experimental-webgl');

    if (!context) {
      return { available: false, message: 'WebGL is not available in this browser or device.' };
    }

    return { available: true };
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error ? error.message : 'WebGL availability could not be checked.',
    };
  }
}
