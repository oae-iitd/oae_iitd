import { describe, it, expect, beforeEach } from 'vitest';
import { applyAccentColorVars, ACCENT_COLOR_MAP } from './accentColors';

describe('applyAccentColorVars', () => {
  beforeEach(() => {
    const root = document.documentElement.style;
    root.removeProperty('--accent-color');
    root.removeProperty('--accent-hover');
    root.removeProperty('--accent-light');
  });

  it('sets CSS variables for a known accent', () => {
    applyAccentColorVars('green');
    expect(document.documentElement.style.getPropertyValue('--accent-color')).toBe(
      ACCENT_COLOR_MAP.green.color
    );
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toBe(
      ACCENT_COLOR_MAP.green.hover
    );
  });

  it('falls back to blue for unknown keys', () => {
    applyAccentColorVars('unknown-accent');
    expect(document.documentElement.style.getPropertyValue('--accent-color')).toBe(
      ACCENT_COLOR_MAP.blue.color
    );
  });
});
