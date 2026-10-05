/**
 * Regression coverage for `design-system/src/types/tokens.ts`.
 *
 * `tokens.ts` is a type-only module, so its contracts are pinned at two levels:
 *
 *  1. Compile time — token fixtures are annotated with the exported interfaces
 *     and deliberately invalid shapes use `@ts-expect-error`, so the suite fails
 *     if a contract is silently weakened, widened, or re-typed.
 *  2. Runtime — every shipped DTCG JSON file in `tokens/` is parsed and walked
 *     against the same contracts, so malformed, unsupported, or duplicate token
 *     nodes are rejected deterministically instead of slipping through the
 *     `JSON.parse(...) as DesignTokens` cast in `token-loader`.
 */

import type {
  BorderToken,
  ColorToken,
  ColorTokenNode,
  DesignTokens,
  MotionToken,
  OpacityToken,
  ShadowLayer,
  ShadowToken,
  SpacingToken,
  ToastToken,
  TypographyToken,
  ZIndexToken,
} from '../types/tokens';
import { getAllTokens, loadTokens } from '../utils/token-loader';
import { isValidColorToken } from '../utils/validators';

type Leaf = { path: string; node: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Depth-first walk of a DTCG tree. Any object carrying a string `$type` is a
 * leaf token and is not descended into; everything else is treated as a group.
 */
function collectLeaves(value: unknown, path: string[] = []): Leaf[] {
  if (!isRecord(value)) return [];

  if (typeof value.$type === 'string') {
    return [{ path: path.join('.'), node: value }];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    if (key.startsWith('$')) return [];
    return collectLeaves(child, [...path, key]);
  });
}

/** Contract violations for a leaf token, mirroring the interfaces in tokens.ts. */
function violationsForLeaf(leaf: Leaf): string[] {
  const { path, node } = leaf;
  const type = typeof node.$type === 'string' ? node.$type : undefined;
  const violations: string[] = [];

  const requireStringValue = () => {
    if (typeof node.$value !== 'string' || node.$value.length === 0) {
      violations.push(`${path}: expected a non-empty string $value`);
    }
  };

  switch (type) {
    case 'color': {
      requireStringValue();
      if (node.contrast !== undefined) {
        if (!isRecord(node.contrast)) {
          violations.push(`${path}: contrast must be an object`);
        } else {
          for (const [key, ratio] of Object.entries(node.contrast)) {
            if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
              violations.push(`${path}: contrast.${key} must be a finite number`);
            }
          }
        }
      }
      if (node.accessibility !== undefined) {
        if (!isRecord(node.accessibility)) {
          violations.push(`${path}: accessibility must be an object`);
        } else {
          const { wcagLevel, colorblindSafe, colorblindSimulation } =
            node.accessibility;
          if (wcagLevel !== undefined && wcagLevel !== 'AA' && wcagLevel !== 'AAA') {
            violations.push(`${path}: wcagLevel must be "AA" or "AAA"`);
          }
          if (colorblindSafe !== undefined && typeof colorblindSafe !== 'boolean') {
            violations.push(`${path}: colorblindSafe must be a boolean`);
          }
          if (colorblindSimulation !== undefined) {
            if (!isRecord(colorblindSimulation)) {
              violations.push(`${path}: colorblindSimulation must be an object`);
            } else {
              for (const [mode, value] of Object.entries(colorblindSimulation)) {
                if (typeof value !== 'string') {
                  violations.push(`${path}: colorblindSimulation.${mode} must be a string`);
                }
              }
            }
          }
        }
      }
      break;
    }
    case 'dimension':
      requireStringValue();
      break;
    case 'number':
      if (typeof node.$value !== 'number' || !Number.isFinite(node.$value)) {
        violations.push(`${path}: expected a finite number $value`);
      }
      break;
    case 'typography':
      for (const key of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing']) {
        const sub = node[key];
        if (sub !== undefined) {
          if (!isRecord(sub) || typeof sub.$value !== 'string') {
            violations.push(`${path}: ${key} must be a { $value: string } object`);
          }
        }
      }
      if (node.fontWeight !== undefined) {
        if (!isRecord(node.fontWeight) || typeof node.fontWeight.$value !== 'number') {
          violations.push(`${path}: fontWeight must be a { $value: number } object`);
        }
      }
      break;
    // The simple font scales in tokens/typography.json are DTCG primitives
    // rather than composite `typography` tokens.
    case 'fontFamily':
      requireStringValue();
      break;
    case 'fontWeight':
      if (typeof node.$value !== 'number' || !Number.isFinite(node.$value)) {
        violations.push(`${path}: expected a finite number $value`);
      }
      break;
    case 'shadow': {
      const value = node.$value;
      const layers = Array.isArray(value) ? value : [value];
      if (layers.length === 0) {
        violations.push(`${path}: shadow $value must have at least one layer`);
      }
      for (const layer of layers) {
        if (layer === 'none') continue;
        if (!isRecord(layer)) {
          violations.push(`${path}: shadow layer must be "none" or an object`);
          continue;
        }
        for (const field of ['offsetX', 'offsetY', 'blur', 'spread', 'color']) {
          if (typeof layer[field] !== 'string') {
            violations.push(`${path}: shadow layer.${field} must be a string`);
          }
        }
      }
      break;
    }
    case 'duration':
      requireStringValue();
      break;
    case 'cubicBezier': {
      const value = node.$value;
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        !value.every((n) => typeof n === 'number' && Number.isFinite(n))
      ) {
        violations.push(`${path}: cubicBezier $value must be four finite numbers`);
      }
      break;
    }
    case 'boolean':
      if (typeof node.$value !== 'boolean') {
        violations.push(`${path}: expected a boolean $value`);
      }
      break;
    default:
      violations.push(`${path}: unsupported $type "${String(type)}"`);
  }

  if (node.$description !== undefined && typeof node.$description !== 'string') {
    violations.push(`${path}: $description must be a string`);
  }

  return violations;
}

const TOKEN_FILES = [
  'colors.json',
  'typography.json',
  'spacing.json',
  'shadows.json',
  'motion.json',
  'borders.json',
  'z-index.json',
  'opacity.json',
  'breakpoints.json',
  'toast.json',
] as const;

const DESIGN_TOKEN_KEYS = [
  'color',
  'typography',
  'spacing',
  'shadow',
  'motion',
  'border',
  'zIndex',
  'opacity',
  'breakpoint',
  'toast',
];

describe('tokens.ts — ColorToken contract', () => {
  it('accepts a minimal and a fully annotated ColorToken at compile time', () => {
    const minimal: ColorToken = { $type: 'color', $value: '#112233' };
    const namedContrast: ColorToken = {
      $type: 'color',
      $value: '#112233',
      contrast: { onWhite: 4.52, onNeutral900: 7.21 },
    };
    const annotated: ColorToken = {
      $type: 'color',
      $value: 'rgb(17, 34, 51)',
      $description: 'Primary action color',
      contrast: { light: 4.52, dark: 7.21 },
      accessibility: {
        contrastRatios: { onWhite: 4.52 },
        wcagLevel: 'AAA',
        colorblindSafe: true,
        colorblindSimulation: {
          protanopia: '#112234',
          deuteranopia: 'rgb(17, 34, 52)',
          tritanopia: 'hsl(210, 50%, 13%)',
        },
      },
    };

    expect(minimal.$type).toBe('color');
    expect(namedContrast.contrast?.onWhite).toBe(4.52);
    expect(annotated.accessibility?.wcagLevel).toBe('AAA');
  });

  it('rejects shapes that break the ColorToken contract at compile time', () => {
    // @ts-expect-error $type is the discriminant and must be 'color'
    const wrongType: ColorToken = { $type: 'dimension', $value: '#112233' };
    // @ts-expect-error $value is required
    const missingValue: ColorToken = { $type: 'color' };
    // @ts-expect-error contrast ratios must be numeric
    const wrongContrast: ColorToken = { $type: 'color', $value: '#112233', contrast: { light: 'high' } };

    expect([wrongType, missingValue, wrongContrast]).toHaveLength(3);
  });

  it('accepts every shipped color leaf and agrees with isValidColorToken', () => {
    const leaves = collectLeaves(loadTokens('colors.json'));
    expect(leaves.length).toBeGreaterThan(0);

    const violations = leaves.flatMap(violationsForLeaf);
    expect(violations).toEqual([]);

    for (const leaf of leaves) {
      expect(isValidColorToken(leaf.node)).toBe(true);
    }
  });

  it('rejects malformed color leaves at runtime', () => {
    const malformed: Leaf[] = [
      { path: 'color.bad-type', node: { $type: 'dimension', $value: '#112233' } },
      { path: 'color.bad-value', node: { $type: 'color', $value: 42 } },
      { path: 'color.bad-wcag', node: { $type: 'color', $value: '#112233', accessibility: { wcagLevel: 'A' } } },
      { path: 'color.bad-flag', node: { $type: 'color', $value: '#112233', accessibility: { colorblindSafe: 'true' } } },
      { path: 'color.bad-contrast', node: { $type: 'color', $value: '#112233', contrast: { light: 'high' } } },
      { path: 'color.bad-description', node: { $type: 'color', $value: '#112233', $description: 7 } },
    ];

    for (const leaf of malformed) {
      expect(violationsForLeaf(leaf).length).toBeGreaterThan(0);
    }

    expect(isValidColorToken({ $type: 'color', $value: '#112233' })).toBe(true);
    expect(isValidColorToken({ $type: 'color', $value: 42 })).toBe(false);
  });
});

describe('tokens.ts — ColorTokenNode recursion', () => {
  it('allows a leaf or an arbitrarily nested group of leaves', () => {
    const leaf: ColorTokenNode = { $type: 'color', $value: '#112233' };
    const nested: ColorTokenNode = {
      primary: {
        light: { $type: 'color', $value: '#112233' },
        dark: { $type: 'color', $value: '#334455' },
      },
      chart: {
        categorical: {
          'step-1': { $type: 'color', $value: '#0A7668' },
          'step-2': { $type: 'color', $value: '#1E40AF' },
        },
      },
    };
    const empty: ColorTokenNode = {};

    expect(isRecord(leaf) && isRecord(nested) && isRecord(empty)).toBe(true);
    expect(collectLeaves(leaf)).toHaveLength(1);
    expect(collectLeaves(nested)).toHaveLength(4);
    expect(collectLeaves(empty)).toEqual([]);
  });

  it('walks variant groups and ramps in the shipped palette', () => {
    const tokens = loadTokens('colors.json');
    const chartLeaves = collectLeaves(tokens.color?.chart);
    expect(chartLeaves.length).toBeGreaterThan(0);
    expect(chartLeaves.every((leaf) => leaf.node.$type === 'color')).toBe(true);
  });

  it('handles duplicate JSON keys deterministically (last value wins)', () => {
    const parsed = JSON.parse(
      '{"color":{"primary":{"$type":"color","$value":"#111111"},"primary":{"$type":"color","$value":"#222222"}}}',
    ) as DesignTokens;

    expect(parsed.color?.primary).toEqual({ $type: 'color', $value: '#222222' });
    expect(collectLeaves(parsed)).toEqual([
      { path: 'color.primary', node: { $type: 'color', $value: '#222222' } },
    ]);
  });
});

describe('tokens.ts — TypographyToken contract', () => {
  it('accepts a composite typography token at compile time', () => {
    const token: TypographyToken = {
      $type: 'typography',
      fontFamily: { $value: 'Inter, sans-serif' },
      fontSize: { $value: '48px' },
      lineHeight: { $value: '60px' },
      fontWeight: { $value: 700 },
      letterSpacing: { $value: '-0.01em' },
      $description: 'Display heading',
    };

    expect(token.fontWeight?.$value).toBe(700);
  });

  it('rejects a non-numeric fontWeight sub-value at compile time', () => {
    // @ts-expect-error fontWeight sub-values are numeric
    const token: TypographyToken = { $type: 'typography', fontWeight: { $value: '700' } };

    expect(token.$type).toBe('typography');
  });

  it('validates every typography leaf in the shipped file', () => {
    const leaves = collectLeaves(loadTokens('typography.json'));
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.flatMap(violationsForLeaf)).toEqual([]);

    const composites = leaves.filter((leaf) => leaf.node.$type === 'typography');
    expect(composites.length).toBeGreaterThan(0);
    expect(composites.every((leaf) => violationsForLeaf(leaf).length === 0)).toBe(true);
  });

  it('rejects malformed typography sub-properties', () => {
    expect(
      violationsForLeaf({
        path: 'typography.bad',
        node: { $type: 'typography', fontSize: { $value: 48 } },
      }).length,
    ).toBeGreaterThan(0);
    expect(
      violationsForLeaf({
        path: 'typography.bad',
        node: { $type: 'typography', fontWeight: { $value: 700 }, lineHeight: '60px' },
      }).length,
    ).toBeGreaterThan(0);
  });
});

describe('tokens.ts — SpacingToken and breakpoint contracts', () => {
  it('accepts flat and grouped dimension tokens at compile time', () => {
    const flat: SpacingToken = { $type: 'dimension', $value: '8px' };
    const grouped: SpacingToken | Record<string, SpacingToken> = {
      narrow: { $type: 'dimension', $value: '640px' },
      standard: { $type: 'dimension', $value: '960px' },
    };

    expect(flat.$type).toBe('dimension');
    expect(Object.keys(grouped)).toHaveLength(2);
  });

  it('validates spacing and breakpoint leaves from the shipped files', () => {
    for (const file of ['spacing.json', 'breakpoints.json'] as const) {
      const leaves = collectLeaves(loadTokens(file));
      expect(leaves.length).toBeGreaterThan(0);
      expect(leaves.every((leaf) => violationsForLeaf(leaf).length === 0)).toBe(true);
    }
  });

  it('rejects dimension tokens with a numeric or empty $value', () => {
    expect(
      violationsForLeaf({ path: 'spacing.4', node: { $type: 'dimension', $value: 16 } }).length,
    ).toBeGreaterThan(0);
    expect(
      violationsForLeaf({ path: 'spacing.4', node: { $type: 'dimension', $value: '' } }).length,
    ).toBeGreaterThan(0);
  });
});

describe('tokens.ts — ShadowToken contract', () => {
  it('accepts a single layer, a layer array, and the "none" sentinel', () => {
    const layer: ShadowLayer = {
      offsetX: '0px',
      offsetY: '1px',
      blur: '2px',
      spread: '0px',
      color: 'rgba(0, 0, 0, 0.05)',
    };
    const single: ShadowToken = { $type: 'shadow', $value: layer };
    const stacked: ShadowToken = { $type: 'shadow', $value: [layer, layer] };
    const none: ShadowToken = { $type: 'shadow', $value: 'none' };

    expect(single.$value).toBe(layer);
    expect(stacked.$value).toHaveLength(2);
    expect(none.$value).toBe('none');
  });

  it('validates every shipped shadow leaf', () => {
    const leaves = collectLeaves(loadTokens('shadows.json'));
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every((leaf) => violationsForLeaf(leaf).length === 0)).toBe(true);
  });

  it('rejects layers missing geometry or color fields', () => {
    const violations = violationsForLeaf({
      path: 'shadow.bad',
      node: {
        $type: 'shadow',
        $value: [
          { offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' },
          'not-a-layer',
        ],
      },
    });

    expect(violations.length).toBeGreaterThan(0);
  });
});

describe('tokens.ts — MotionToken contract', () => {
  it('accepts duration, cubicBezier, and boolean tokens at compile time', () => {
    const duration: MotionToken = { $type: 'duration', $value: '200ms' };
    const bezier: MotionToken = { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] };
    const reducedMotion: MotionToken = { $type: 'boolean', $value: true };

    expect([duration.$type, bezier.$type, reducedMotion.$type]).toEqual([
      'duration',
      'cubicBezier',
      'boolean',
    ]);
  });

  it('rejects an unsupported motion $type at compile time', () => {
    // @ts-expect-error only duration, cubicBezier, and boolean are supported
    const token: MotionToken = { $type: 'string', $value: '200ms' };

    expect(token.$value).toBe('200ms');
  });

  it('validates every shipped motion leaf', () => {
    const leaves = collectLeaves(loadTokens('motion.json'));
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every((leaf) => violationsForLeaf(leaf).length === 0)).toBe(true);
  });

  it('rejects malformed cubicBezier and duration values', () => {
    expect(
      violationsForLeaf({
        path: 'motion.easing',
        node: { $type: 'cubicBezier', $value: [0.4, 0, 0.2] },
      }).length,
    ).toBeGreaterThan(0);
    expect(
      violationsForLeaf({
        path: 'motion.duration',
        node: { $type: 'duration', $value: 200 },
      }).length,
    ).toBeGreaterThan(0);
    expect(
      violationsForLeaf({
        path: 'motion.reducedMotion',
        node: { $type: 'boolean', $value: 'true' },
      }).length,
    ).toBeGreaterThan(0);
  });
});

describe('tokens.ts — numeric token contracts (zIndex, opacity, toast)', () => {
  it('accepts numeric tokens at compile time', () => {
    const zIndex: ZIndexToken = { $type: 'number', $value: 300 };
    const opacity: OpacityToken = { $type: 'number', $value: 0.5 };
    const toast: ToastToken = { $type: 'number', $value: 4000 };

    expect([zIndex.$value, opacity.$value, toast.$value]).toEqual([300, 0.5, 4000]);
  });

  it('rejects string $values for numeric token types at compile time', () => {
    // @ts-expect-error ZIndexToken requires a numeric $value
    const zIndex: ZIndexToken = { $type: 'number', $value: '300' };
    // @ts-expect-error OpacityToken requires a numeric $value
    const opacity: OpacityToken = { $type: 'number', $value: '0.5' };
    // @ts-expect-error ToastToken requires a numeric $value
    const toast: ToastToken = { $type: 'number', $value: '4000' };

    expect([zIndex.$type, opacity.$type, toast.$type]).toEqual([
      'number',
      'number',
      'number',
    ]);
  });

  it('validates the z-index, opacity, and toast files and their invariants', () => {
    for (const file of ['z-index.json', 'opacity.json', 'toast.json'] as const) {
      const leaves = collectLeaves(loadTokens(file));
      expect(leaves.length).toBeGreaterThan(0);
      expect(leaves.every((leaf) => violationsForLeaf(leaf).length === 0)).toBe(true);
    }

    const zIndex = loadTokens('z-index.json').zIndex ?? {};
    const order = ['base', 'header', 'tooltip', 'drawer', 'modal', 'toast'].map(
      (key) => zIndex[key].$value,
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));

    const opacity = loadTokens('opacity.json').opacity ?? {};
    for (const token of Object.values(opacity)) {
      expect(token.$value).toBeGreaterThanOrEqual(0);
      expect(token.$value).toBeLessThanOrEqual(1);
    }

    const toast = loadTokens('toast.json').toast ?? {};
    expect(toast.maxVisible.$value).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(toast.maxVisible.$value)).toBe(true);
    expect(toast.reducedMotionDurationMs.$value).toBeLessThanOrEqual(
      toast.defaultDurationMs.$value,
    );
  });

  it('rejects non-finite and out-of-contract numeric values', () => {
    expect(
      violationsForLeaf({ path: 'opacity.bad', node: { $type: 'number', $value: NaN } }).length,
    ).toBeGreaterThan(0);
    expect(
      violationsForLeaf({ path: 'opacity.bad', node: { $type: 'number', $value: Infinity } }).length,
    ).toBeGreaterThan(0);
    expect(
      violationsForLeaf({ path: 'opacity.bad', node: { $type: 'number', $value: '0.5' } }).length,
    ).toBeGreaterThan(0);
  });
});

describe('tokens.ts — BorderToken contract', () => {
  it('accepts dimension and color border tokens at compile time', () => {
    const width: BorderToken = { $type: 'dimension', $value: '1px' };
    const color: BorderToken = { $type: 'color', $value: '#3B82F6' };

    expect([width.$type, color.$type]).toEqual(['dimension', 'color']);
  });

  it('validates every shipped border leaf', () => {
    const leaves = collectLeaves(loadTokens('borders.json'));
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every((leaf) => violationsForLeaf(leaf).length === 0)).toBe(true);
  });
});

describe('tokens.ts — DesignTokens aggregate contract', () => {
  it('builds a DesignTokens literal with every supported category', () => {
    const tokens: DesignTokens = {
      color: { primary: { $type: 'color', $value: '#112233' } },
      typography: { title: { $type: 'typography', fontSize: { $value: '20px' } } },
      spacing: { '4': { $type: 'dimension', $value: '16px' } },
      shadow: { 'level-1': { $type: 'shadow', $value: 'none' } },
      motion: { fast: { $type: 'duration', $value: '150ms' } },
      border: { width: { $type: 'dimension', $value: '1px' } },
      zIndex: { base: { $type: 'number', $value: 0 } },
      opacity: { disabled: { $type: 'number', $value: 0.5 } },
      breakpoint: { sm: { $type: 'dimension', $value: '640px' } },
      toast: { maxVisible: { $type: 'number', $value: 5 } },
    };

    expect(Object.keys(tokens)).toHaveLength(DESIGN_TOKEN_KEYS.length);
  });

  it('loads every shipped token file into a valid DesignTokens tree', () => {
    for (const file of TOKEN_FILES) {
      const leaves = collectLeaves(loadTokens(file));
      expect(leaves.length).toBeGreaterThan(0);
      expect(leaves.every((leaf) => violationsForLeaf(leaf).length === 0)).toBe(true);
    }

    const merged = getAllTokens();
    for (const key of Object.keys(merged)) {
      expect(DESIGN_TOKEN_KEYS).toContain(key);
    }
  });

  it('rejects token file names that escape the tokens directory (authorization)', () => {
    const rejected = [
      '',
      'colors',
      'colors.txt',
      '../colors.json',
      '..\\colors.json',
      'nested/colors.json',
      'nested\\colors.json',
      '/etc/passwd.json',
    ];

    for (const name of rejected) {
      expect(() => loadTokens(name)).toThrow(/Invalid token file name/);
    }
  });

  it('is deterministic across retries and concurrent loads', async () => {
    const first = loadTokens('spacing.json');
    const second = loadTokens('spacing.json');
    expect(second).toEqual(first);

    const concurrent = await Promise.all(
      Array.from({ length: 5 }, () => Promise.resolve().then(() => loadTokens('spacing.json'))),
    );
    for (const result of concurrent) {
      expect(result).toEqual(first);
    }
    expect(JSON.stringify(getAllTokens())).toBe(JSON.stringify(getAllTokens()));
  });

  it('isolates callers from each other via freshly parsed objects', () => {
    const snapshot = loadTokens('opacity.json');
    const mutable = loadTokens('opacity.json');

    mutable.opacity!.disabled.$value = 0;

    expect(mutable.opacity!.disabled.$value).toBe(0);
    expect(loadTokens('opacity.json')).toEqual(snapshot);
    expect(loadTokens('opacity.json').opacity!.disabled.$value).toBe(0.5);
  });

  it('does not persist unsupported token categories from partial data', () => {
    const parsed = JSON.parse(
      '{"color":{"primary":{"$type":"color","$value":"#112233"}},"unknownCategory":{"x":1}}',
    ) as Record<string, unknown>;

    const leaves = collectLeaves(parsed);
    expect(leaves).toHaveLength(1);
    expect(leaves[0].node.$type).toBe('color');
  });
});
