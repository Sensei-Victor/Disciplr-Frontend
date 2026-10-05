import { loadTokens } from '../utils/token-loader';
import {
  validateDesignTokens,
  validateTokenNode,
} from '../types/tokens';

describe('spacing token container ramp', () => {
  it('loads container size tokens from spacing.json', () => {
    const tokens = loadTokens('spacing.json');

    expect(tokens).toHaveProperty('spacing.container');
    expect(tokens.spacing?.container).toMatchObject({
      narrow: { $value: '640px' },
      standard: { $value: '960px' },
      wide: { $value: '1100px' },
      max: { $value: '1280px' },
    });
  });
});

describe('z-index token layering scale', () => {
  it('loads z-index tokens from z-index.json', () => {
    const tokens = loadTokens('z-index.json');

    expect(tokens).toHaveProperty('zIndex');
    expect(tokens.zIndex).toMatchObject({
      base: { $value: 0 },
      header: { $value: 100 },
      drawer: { $value: 200 },
      modal: { $value: 300 },
      toast: { $value: 400 },
    });
  });
});

describe('breakpoint token scale', () => {
  it('loads breakpoint tokens from breakpoints.json', () => {
    const tokens = loadTokens('breakpoints.json');

    expect(tokens).toHaveProperty('breakpoint');
    expect(tokens.breakpoint).toMatchObject({
      sm: { $value: '640px' },
      md: { $value: '768px' },
      lg: { $value: '1024px' },
      xl: { $value: '1280px' },
    });
  });
});

describe('opacity token scale', () => {
  it('loads opacity tokens from opacity.json', () => {
    const tokens = loadTokens('opacity.json');

    expect(tokens).toHaveProperty('opacity');
    expect(tokens.opacity).toMatchObject({
      disabled: { $value: 0.5 },
      backdrop: { $value: 0.5 },
      hover: { $value: 0.08 },
      muted: { $value: 0.72 },
    });
  });
});

describe('validateTokenNode failure paths', () => {
  it('rejects non-object nodes', () => {
    for (const invalid of [null, undefined, 123, 'string', true, []]) {
      const result = validateTokenNode(invalid);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects unsupported $type values', () => {
    const result = validateTokenNode({ $type: 'unknown', $value: 'x' });
    expect(result.ok).toBe(false);
  });

  it('rejects missing $value', () => {
    const result = validateTokenNode({ $type: 'color' });
    expect(result.ok).toBe(false);
  });

  it('rejects a $type that does not match the expected group type', () => {
    const result = validateTokenNode({ $type: 'color', $value: '#000' }, 'dimension');
    expect(result.ok).toBe(false);
  });

  it('rejects color tokens with empty $value', () => {
    expect(validateTokenNode({ $type: 'color', $value: '' }).ok).toBe(false);
    expect(validateTokenNode({ $type: 'color', $value: '  ' }).ok).toBe(false);
  });

  it('rejects non-finite numeric tokens', () => {
    expect(validateTokenNode({ $type: 'number', $value: NaN }).ok).toBe(false);
    expect(validateTokenNode({ $type: 'number', $value: Infinity }).ok).toBe(false);
    expect(validateTokenNode({ $type: 'number', $value: '1' }).ok).toBe(false);
  });

  it('rejects cubicBezier values that are not a 4-tuple of finite numbers', () => {
    expect(validateTokenNode({ $type: 'cubicBezier', $value: [0.1, 0.2, 0.3 ] }).ok).toBe(false);
    expect(validateTokenNode({ $type: 'cubicBezier', $value: [0.1, 0.2, 0.3, 0.4 } }).ok).toBe(true);
    expect(validateTokenNode({ $type: 'cubicBezier', $value: [0.1, 0.2, 0.3, NaN ] }).ok).toBe(false);
  });

  it('rejects empty shadow arrays', () => {
    expect(validateTokenNode({ $type: 'shadow', $value: [] }).ok).toBe(false);
  });
});

describe('validateDesignTokens boundary coverage', () => {
  it('accepts a minimal valid container', () => {
    expect(validateDesignTokens({}).ok).toBe(true);
  });

  it('rejects non-object containers', () => {
    for (const invalid of [null, undefined, 'x', 123, []]) {
      expect(validateDesignTokens(invalid).ok).toBe(false);
    }
  });

  it('rejects a known group that is not an object', () => {
    const result = validateDesignTokens({ color: 'not-an-object' });
    expect(result.ok).toBe(false);
  });

  it('rejects a color group with an invalid leaf', () => {
    const result = validateDesignTokens({
      color: { primary: { $type: 'color', $value: '' } },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a numeric group with a non-numeric leaf', () => {
    const result = validateDesignTokens({
      zIndex: { base: { $type: 'number', $value: '0' } },
    });
    expect(result.ok).toBe(false);
  });

  it('validates nested spacing groups', () => {
    const result = validateDesignTokens({
      spacing: {
        container: {
          narrow: { $type: 'dimension', $value: '640px' },
          standard: { $type: 'dimension', $value: '960px' },
        },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a nested spacing group with an invalid leaf', () => {
    const result = validateDesignTokens({
      spacing: {
        container: {
          narrow: { $type: 'dimension', $value: '' },
        },
      },
    });
    expect(result.ok).toBe(false);
  });

  it('ignores unknown top-level keys to preserve forward compatibility', () => {
    expect(validateDesignTokens({ futureGroup: { any: 'thing' } }).ok).toBe(true);
  });

  it('reports a path on failure for diagnosis', () => {
    const result = validateDesignTokens({
      color: { primary: { $type: 'color', $value: '' } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.path).toBe('color.primary');
    }
  });

  it('is deterministic and does not mutate input', () => {
    const input = {
      color: { primary: { $type: 'color', $value: '#112233' } },
    };
    const snapshot = JSON.stringify(input);
    expect(validateDesignTokens(input).ok).toBe(true);
    expect(validateDesignTokens(input).ok).toBe(true);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
