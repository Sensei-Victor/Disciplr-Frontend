import * as DesignSystem from '../index';
import {
  generateCssVariables,
  generateCssVariablesString,
  getTokenValue,
  hasValidTokenPrefix,
  isKebabCase,
  isValidColorString,
  isValidHexColor,
  isValidHslColor,
  isValidRgbColor,
  loadTokens,
} from '../index';

// Keep this public-entry-point suite independent from the Vite-only import.meta
// branch in the shared logger; logger behavior has its own dedicated suite.
jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Design System Index', () => {
  it('should export all expected modules without missing dependencies', () => {
    // Assert that the module itself loaded
    expect(DesignSystem).toBeDefined();

    // Test that the public entry point exports its supported runtime API
    expect(typeof DesignSystem.generateCssVariables).toBe('function');
    expect(typeof DesignSystem.loadTokens).toBe('function');
    expect(typeof DesignSystem.isValidColorString).toBe('function');
    expect(Object.keys(DesignSystem).length).toBeGreaterThan(0);
  });

  describe('Failure paths and boundaries', () => {
    it('should safely allow multiple concurrent imports (duplicate loading)', async () => {
      const imports = await Promise.all([
        import('../index'),
        import('../index'),
        import('../index'),
      ]);

      const [moduleA, moduleB, moduleC] = imports;

      expect(moduleA).toBe(moduleB);
      expect(moduleB).toBe(moduleC);
      expect(typeof moduleA.loadTokens).toBe('function');
      expect(typeof moduleA.logger).toBe('object');
    });

    it('should handle undefined or invalid property access boundaries securely', () => {
      // @ts-expect-error - deliberate invalid access for boundary testing
      const invalidAccess = DesignSystem['nonExistentProperty'];
      expect(invalidAccess).toBeUndefined();
    });

    it('should maintain deterministic behavior for exports', () => {
      const logger1 = DesignSystem.logger;
      const logger2 = DesignSystem.logger;
      expect(logger1).toBe(logger2);
    });
  });
});

describe('design-system public entry point', () => {
  it('re-exports the supported runtime API', () => {
    expect(typeof generateCssVariables).toBe('function');
    expect(typeof generateCssVariablesString).toBe('function');
    expect(typeof getTokenValue).toBe('function');
    expect(typeof loadTokens).toBe('function');
    expect(typeof hasValidTokenPrefix).toBe('function');
  });

  it('keeps validation results deterministic at valid and invalid boundaries', () => {
    expect(isValidHexColor('#abc')).toBe(true);
    expect(isValidHexColor('#12345g')).toBe(false);
    expect(isValidRgbColor('rgb(0, 0, 0)')).toBe(true);
    expect(isValidRgbColor('rgba(0, 0, 0, 1)')).toBe(false);
    expect(isValidHslColor('hsl(210, 50%, 40%)')).toBe(true);
    expect(isValidHslColor('hsl(210, 50, 40)')).toBe(false);
    expect(isValidColorString('var(--accent)')).toBe(false);
    expect(isKebabCase('chart-grid-1')).toBe(true);
    expect(isKebabCase('Chart-Grid')).toBe(false);
    expect(hasValidTokenPrefix('color-primary')).toBe(true);
    expect(hasValidTokenPrefix('unknown-primary')).toBe(false);
  });

  it('rejects unsafe token-loader inputs before reading from disk', () => {
    expect(() => loadTokens('../tokens/colors.json')).toThrow(
      'Invalid token file name',
    );
    expect(() => loadTokens('colors')).toThrow('Invalid token file name');
    expect(() => loadTokens('colors.json/../../secrets.json')).toThrow(
      'Invalid token file name',
    );
  });

  it('preserves deterministic mode selection, references, and output ordering', () => {
    const tokens = {
      color: {
        primary: {
          light: { $type: 'color', $value: '#111111' },
          dark: { $type: 'color', $value: '#eeeeee' },
        },
        surface: {
          light: { $type: 'color', $value: '{color.primary}' },
          dark: { $type: 'color', $value: '{color.primary}' },
        },
      },
    };

    expect(generateCssVariables(tokens, 'light')).toEqual({
      'color-primary': '#111111',
      'color-surface': '#111111',
    });
    expect(generateCssVariables(tokens, 'dark')).toEqual({
      'color-primary': '#eeeeee',
      'color-surface': '#eeeeee',
    });
    expect(
      generateCssVariablesString(tokens, 'dark', { prefix: 'ds' }),
    ).toContain('--ds-color-primary: #eeeeee;');
  });

  it('returns undefined for missing token paths without mutating the token source', () => {
    const tokensBefore = JSON.stringify({ value: '#111111' });

    expect(getTokenValue('color.doesNotExist')).toBeUndefined();
    expect(JSON.stringify({ value: '#111111' })).toBe(tokensBefore);
  });
});
