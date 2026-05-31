import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseDOM, detectWebGLAvailability, resolveMotionPreference } from './environment';

describe('environment helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
