import { describe, expect, it } from 'vitest';
import {
  GALAXY_GRAPH_THEME_CHOICES,
  GALAXY_GRAPH_THEMES,
  resolveGalaxyGraphTheme,
  type GalaxyGraphTheme,
} from './rendererConfig';

describe('resolveGalaxyGraphTheme', () => {
  it('defaults to the dark galaxy preset', () => {
    const theme = resolveGalaxyGraphTheme();

    expect(theme).toBe(GALAXY_GRAPH_THEMES['galaxy-dark']);
    expect(theme.id).toBe('galaxy-dark');
    expect(theme.mode).toBe('dark');
    expect(theme.dataColorStrategy).toBe('data');
    expect(theme.scene.pointStyle).toBe('glow');
    expect(theme.scene.edgeBlending).toBe('additive');
    expect(theme.scene.toneMapping).toBe('aces');
  });

  it('resolves the network light preset', () => {
    const theme = resolveGalaxyGraphTheme('network-light');

    expect(theme.id).toBe('network-light');
    expect(theme.label).toBe('Network light');
    expect(theme.mode).toBe('light');
    expect(theme.background).toBe('#ffffff');
    expect(theme.dataColorStrategy).toBe('data');
    expect(theme.chrome.sceneVignette).toBe('none');
    expect(theme.scene.pointStyle).toBe('disc');
    expect(theme.scene.pointBlending).toBe('normal');
    expect(theme.scene.edgeBlending).toBe('normal');
    expect(theme.scene.toneMapping).toBe('none');
    expect(theme.scene.starOpacity).toBe(0);
    expect(theme.scene.clusterOpacity).toBe(0);
  });

  it('merges legacy custom objects over the dark preset', () => {
    const theme = resolveGalaxyGraphTheme({
      background: '#07090d',
      panelAccentColor: '#67e8c9',
      selectedColor: '#f8fafc',
    });

    expect(theme.id).toBe('galaxy-dark');
    expect(theme.background).toBe('#07090d');
    expect(theme.panelAccentColor).toBe('#67e8c9');
    expect(theme.selectedColor).toBe('#f8fafc');
    expect(theme.mode).toBe('dark');
    expect(theme.dataColorStrategy).toBe('data');
    expect(theme.scene.pointStyle).toBe('glow');
    expect(theme.scene.edgeBlending).toBe('additive');
  });

  it('keeps unknown custom ids while inheriting missing fields from dark', () => {
    const customTheme: GalaxyGraphTheme = {
      id: 'blueprint',
      label: 'Blueprint',
      background: '#f9fbff',
      chrome: { sceneVignette: 'none' },
      scene: { edgeColor: '#4f8fb8', edgeOpacityMultiplier: 0.5 },
    };
    const theme = resolveGalaxyGraphTheme(customTheme);

    expect(theme.id).toBe('blueprint');
    expect(theme.label).toBe('Blueprint');
    expect(theme.background).toBe('#f9fbff');
    expect(theme.chrome.sceneVignette).toBe('none');
    expect(theme.scene.edgeColor).toBe('#4f8fb8');
    expect(theme.scene.edgeOpacityMultiplier).toBe(0.5);
    expect(theme.scene.pointStyle).toBe('glow');
    expect(theme.scene.edgeBlending).toBe('additive');
  });

  it('exports default selector choices for the built-in presets', () => {
    expect(GALAXY_GRAPH_THEME_CHOICES).toEqual([
      { id: 'galaxy-dark', label: 'Galaxy dark' },
      { id: 'network-light', label: 'Network light' },
    ]);
  });
});
