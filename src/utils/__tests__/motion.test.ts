import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  duration,
  ease,
  transitionEnter,
  transitionExit,
  transitionPage,
} from '../motion';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a CSS duration string like "300ms" or "0.3s" to a number of seconds,
 * matching the unit framer-motion uses in its `duration` prop.
 */
function parseDurationToSeconds(value: string): number {
  if (typeof value !== 'string') {
    throw new Error(`Expected string duration, got ${typeof value}`);
  }
  let parsed: number;
  if (value.endsWith('ms')) {
    parsed = parseFloat(value) / 1000;
  } else if (value.endsWith('s')) {
    parsed = parseFloat(value);
  } else {
    throw new Error(`Unrecognised duration unit in token: "${value}"`);
  }
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value in token: "${value}"`);
  }
  return parsed;
}

describe('parseDurationToSeconds', () => {
  it('parses valid ms and s values', () => {
    expect(parseDurationToSeconds('300ms')).toBe(0.3);
    expect(parseDurationToSeconds('0.5s')).toBe(0.5);
    expect(parseDurationToSeconds('0s')).toBe(0);
  });

  it('throws on invalid or missing units', () => {
    expect(() => parseDurationToSeconds('300')).toThrow(/Unrecognised duration unit/);
    expect(() => parseDurationToSeconds('300m')).toThrow(/Unrecognised duration unit/);
    expect(() => parseDurationToSeconds('')).toThrow(/Unrecognised duration unit/);
  });

  it('throws on invalid numeric prefixes', () => {
    expect(() => parseDurationToSeconds('ms')).toThrow(/Invalid numeric value/);
    expect(() => parseDurationToSeconds('abcms')).toThrow(/Invalid numeric value/);
  });

  it('throws on non-string inputs', () => {
    // @ts-expect-error testing invalid input
    expect(() => parseDurationToSeconds(300)).toThrow(/Expected string/);
    // @ts-expect-error testing invalid input
    expect(() => parseDurationToSeconds(null)).toThrow(/Expected string/);
  });
});

// Load the token file once for the entire module.
// Resolving relative to the project root keeps this test independent of cwd.
const TOKEN_PATH = resolve(__dirname, '../../../design-system/tokens/motion.json');
const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8')) as {
  motion: {
    duration: Record<string, { $value: string }>;
    easing: Record<string, { $value: [number, number, number, number] }>;
  };
};

// ── duration ─────────────────────────────────────────────────────────────────

describe('duration', () => {
  it('exports exactly the six named durations', () => {
    expect(Object.keys(duration)).toEqual([
      'micro', 'fast', 'normal', 'moderate', 'slow', 'slower',
    ]);
  });

  it('micro is 0.1 s', () => {
    expect(duration.micro).toBe(0.1);
  });

  it('fast is 0.15 s', () => {
    expect(duration.fast).toBe(0.15);
  });

  it('normal is 0.2 s', () => {
    expect(duration.normal).toBe(0.2);
  });

  it('moderate is 0.3 s', () => {
    expect(duration.moderate).toBe(0.3);
  });

  it('slow is 0.4 s', () => {
    expect(duration.slow).toBe(0.4);
  });

  it('slower is 0.5 s', () => {
    expect(duration.slower).toBe(0.5);
  });

  it('all values are positive finite numbers', () => {
    for (const [key, value] of Object.entries(duration)) {
      expect(typeof value, `duration.${key} should be a number`).toBe('number');
      expect(Number.isFinite(value), `duration.${key} should be finite`).toBe(true);
      expect(value, `duration.${key} should be positive`).toBeGreaterThan(0);
    }
  });

  // ── cross-check against design-system/tokens/motion.json ─────────────────

  it.each([
    ['micro',    'micro'],
    ['fast',     'fast'],
    ['normal',   'normal'],
    ['moderate', 'moderate'],
    ['slow',     'slow'],
    ['slower',   'slower'],
  ] as const)(
    'duration.%s matches motion.json token "%s"',
    (jsKey, tokenKey) => {
      const raw = tokens.motion.duration[tokenKey].$value;
      const expected = parseDurationToSeconds(raw);
      expect(duration[jsKey]).toBe(expected);
    },
  );
});

// ── ease ─────────────────────────────────────────────────────────────────────

describe('ease', () => {
  it('exports exactly the five named easing curves', () => {
    expect(Object.keys(ease)).toEqual([
      'inOut', 'out', 'in', 'bounce', 'smooth',
    ]);
  });

  it('every curve is an array of four numbers', () => {
    for (const [key, curve] of Object.entries(ease)) {
      expect(Array.isArray(curve), `ease.${key} should be an array`).toBe(true);
      expect(curve, `ease.${key} should have four elements`).toHaveLength(4);
      curve.forEach((n, i) => {
        expect(typeof n, `ease.${key}[${i}] should be a number`).toBe('number');
      });
    }
  });

  it('inOut is [0.4, 0, 0.2, 1]', () => {
    expect(ease.inOut).toEqual([0.4, 0, 0.2, 1]);
  });

  it('out is [0, 0, 0.2, 1]', () => {
    expect(ease.out).toEqual([0, 0, 0.2, 1]);
  });

  it('in is [0.4, 0, 1, 1]', () => {
    expect(ease.in).toEqual([0.4, 0, 1, 1]);
  });

  it('bounce is [0.68, -0.55, 0.265, 1.55]', () => {
    expect(ease.bounce).toEqual([0.68, -0.55, 0.265, 1.55]);
  });

  it('smooth is [0.25, 0.1, 0.25, 1]', () => {
    expect(ease.smooth).toEqual([0.25, 0.1, 0.25, 1]);
  });

  // ── cross-check against design-system/tokens/motion.json ─────────────────
  //
  // The token file uses hyphenated keys (ease-in-out) while motion.ts uses
  // camelCase (inOut). The mapping below is the authoritative correspondence.

  it.each([
    ['inOut',  'ease-in-out'],
    ['out',    'ease-out'],
    ['in',     'ease-in'],
    ['bounce', 'bounce'],
    ['smooth', 'smooth'],
  ] as const)(
    'ease.%s matches motion.json easing token "%s"',
    (jsKey, tokenKey) => {
      const expected = tokens.motion.easing[tokenKey].$value;
      expect(ease[jsKey]).toEqual(expected);
    },
  );
});

// ── transitionEnter ───────────────────────────────────────────────────────────

describe('transitionEnter', () => {
  it('has a duration property', () => {
    expect(transitionEnter).toHaveProperty('duration');
  });

  it('has an ease property', () => {
    expect(transitionEnter).toHaveProperty('ease');
  });

  it('uses the moderate duration', () => {
    expect(transitionEnter.duration).toBe(duration.moderate);
  });

  it('uses the out easing curve', () => {
    expect(transitionEnter.ease).toEqual(ease.out);
  });

  it('snapshot', () => {
    expect(transitionEnter).toMatchInlineSnapshot(`
      {
        "duration": 0.3,
        "ease": [
          0,
          0,
          0.2,
          1,
        ],
      }
    `);
  });
});

// ── transitionExit ────────────────────────────────────────────────────────────

describe('transitionExit', () => {
  it('has a duration property', () => {
    expect(transitionExit).toHaveProperty('duration');
  });

  it('has an ease property', () => {
    expect(transitionExit).toHaveProperty('ease');
  });

  it('uses the normal duration', () => {
    expect(transitionExit.duration).toBe(duration.normal);
  });

  it('uses the in easing curve', () => {
    expect(transitionExit.ease).toEqual(ease.in);
  });

  it('snapshot', () => {
    expect(transitionExit).toMatchInlineSnapshot(`
      {
        "duration": 0.2,
        "ease": [
          0.4,
          0,
          1,
          1,
        ],
      }
    `);
  });
});

// ── transitionPage ────────────────────────────────────────────────────────────

describe('transitionPage', () => {
  it('has a duration property', () => {
    expect(transitionPage).toHaveProperty('duration');
  });

  it('has an ease property', () => {
    expect(transitionPage).toHaveProperty('ease');
  });

  it('uses the moderate duration', () => {
    expect(transitionPage.duration).toBe(duration.moderate);
  });

  it('uses the out easing curve', () => {
    expect(transitionPage.ease).toEqual(ease.out);
  });

  it('snapshot', () => {
    expect(transitionPage).toMatchInlineSnapshot(`
      {
        "duration": 0.3,
        "ease": [
          0,
          0,
          0.2,
          1,
        ],
      }
    `);
  });
});

// ── composite shape guard ─────────────────────────────────────────────────────
//
// A single snapshot covering all five exports so any accidental addition,
// removal, or rename of a top-level export is immediately caught.

describe('module shape', () => {
  it('snapshot of all exported constants', () => {
    expect({ duration, ease, transitionEnter, transitionExit, transitionPage })
      .toMatchInlineSnapshot(`
        {
          "duration": {
            "fast": 0.15,
            "micro": 0.1,
            "moderate": 0.3,
            "normal": 0.2,
            "slow": 0.4,
            "slower": 0.5,
          },
          "ease": {
            "bounce": [
              0.68,
              -0.55,
              0.265,
              1.55,
            ],
            "in": [
              0.4,
              0,
              1,
              1,
            ],
            "inOut": [
              0.4,
              0,
              0.2,
              1,
            ],
            "out": [
              0,
              0,
              0.2,
              1,
            ],
            "smooth": [
              0.25,
              0.1,
              0.25,
              1,
            ],
          },
          "transitionEnter": {
            "duration": 0.3,
            "ease": [
              0,
              0,
              0.2,
              1,
            ],
          },
          "transitionExit": {
            "duration": 0.2,
            "ease": [
              0.4,
              0,
              1,
              1,
            ],
          },
          "transitionPage": {
            "duration": 0.3,
            "ease": [
              0,
              0,
              0.2,
              1,
            ],
          },
        }
      `);
  });

  it('keeps every token-backed duration and easing value finite', () => {
    for (const value of Object.values(duration)) {
      expect(Number.isFinite(value)).toBe(true);
    }
    for (const curve of Object.values(ease)) {
      expect(curve).toHaveLength(4);
      expect(curve.every((value) => Number.isFinite(value))).toBe(true);
    }
  });
});
