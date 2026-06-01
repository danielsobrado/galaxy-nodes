import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canUseDOM,
  detectWebGLAvailability,
  getGalaxyRendererContextBudget,
  reserveGalaxyRendererContext,
  resetGalaxyRendererContextBudgetForTests,
  resolveMotionPreference,
} from './environment';

describe('environment helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetGalaxyRendererContextBudgetForTests();
  });

  it('resolves explicit motion preferences without reading media queries', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => {
        throw new Error('should not be called');
      }),
    });
    vi.stubGlobal('document', { createElement: vi.fn() });

    expect(resolveMotionPreference('full')).toBe('full');
    expect(resolveMotionPreference('reduced')).toBe('reduced');
  });

  it('resolves system motion from prefers-reduced-motion', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    vi.stubGlobal('document', { createElement: vi.fn() });

    expect(resolveMotionPreference('system')).toBe('reduced');
  });

  it('falls back to full motion without a browser DOM', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    expect(canUseDOM()).toBe(false);
    expect(resolveMotionPreference('system')).toBe('full');
  });

  it('reports WebGL unavailable without DOM or canvas support', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    expect(detectWebGLAvailability()).toMatchObject({ available: false });

    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { createElement: vi.fn(() => ({})) });

    expect(detectWebGLAvailability()).toMatchObject({ available: false });
  });

  it('reports WebGL unavailable when context creation fails', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => null),
      })),
    });

    expect(detectWebGLAvailability()).toMatchObject({ available: false });
  });

  it('reports WebGL available when a WebGL context is returned', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        getContext: vi.fn((contextId: string) => (contextId === 'webgl2' ? {} : null)),
      })),
    });

    expect(detectWebGLAvailability()).toEqual({ available: true });
  });

  it('limits active Galaxy renderer context reservations and releases them idempotently', () => {
    const releases: Array<() => void> = [];

    for (let index = 0; index < getGalaxyRendererContextBudget().limit; index += 1) {
      const release = reserveGalaxyRendererContext();
      expect(release).toEqual(expect.any(Function));
      releases.push(release!);
    }

    expect(getGalaxyRendererContextBudget()).toMatchObject({ active: releases.length, remaining: 0 });
    expect(reserveGalaxyRendererContext()).toBeNull();

    releases[0]();
    releases[0]();

    expect(getGalaxyRendererContextBudget().active).toBe(releases.length - 1);
    expect(reserveGalaxyRendererContext()).toEqual(expect.any(Function));
  });

  it('supports caller-provided renderer context limits', () => {
    const firstRelease = reserveGalaxyRendererContext(1);

    expect(firstRelease).toEqual(expect.any(Function));
    expect(getGalaxyRendererContextBudget(1)).toEqual({ active: 1, limit: 1, remaining: 0 });
    expect(reserveGalaxyRendererContext(1)).toBeNull();

    firstRelease?.();
    expect(getGalaxyRendererContextBudget(1)).toEqual({ active: 0, limit: 1, remaining: 1 });
  });
});
