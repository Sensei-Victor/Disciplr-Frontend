/**
 * Design token type definitions for type-safe token access
 */

export interface ColorToken {
  $type: 'color';
  $value: string;
  $description?: string;
  /**
   * Contrast ratios keyed by the surface they were measured against
   * (e.g. `onWhite`, `onNeutral50`). Numeric only; callers that only need
   * `light`/`dark` can read those keys directly.
   */
  contrast?: Record<string, number>;
  accessibility?: {
    contrastRatios?: Record<string, number>;
    wcagLevel?: 'AA' | 'AAA';
    colorblindSafe?: boolean;
    colorblindSimulation?: {
      protanopia?: string;
      deuteranopia?: string;
      tritanopia?: string;
    };
  };
}

export interface TypographyToken {
  $type: 'typography';
  fontFamily?: { $value: string };
  fontSize?: { $value: string };
  lineHeight?: { $value: string };
  fontWeight?: { $value: number };
  letterSpacing?: { $value: string };
  $description?: string;
}

export interface SpacingToken {
  $type: 'dimension';
  $value: string;
  $description?: string;
}

export interface ShadowLayer {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string;
}

/**
 * Shadow tokens are either an explicit layer stack or the `'none'` sentinel
 * used by the flat `level-0` token in `tokens/shadows.json`.
 */
export interface ShadowToken {
  $type: 'shadow';
  $value: ShadowLayer | ShadowLayer[] | 'none';
  $description?: string;
}

/**
 * Motion tokens cover the three DTCG shapes shipped in `tokens/motion.json`:
 * `duration` (e.g. "200ms"), `cubicBezier` (exactly four unit-less numbers),
 * and `boolean` (e.g. the `reducedMotion` preference flag).
 *
 * The `boolean` member was added to describe already-shipped data; it is an
 * additive, backwards-compatible widening of this union.
 */
export interface MotionToken {
  $type: 'duration' | 'cubicBezier' | 'boolean';
  $value: string | number[] | boolean;
  $description?: string;
}

export interface ZIndexToken {
  $type: 'number';
  $value: number;
  $description?: string;
}

export interface OpacityToken {
  $type: 'number';
  $value: number;
  $description?: string;
}

export interface BorderToken {
  $type: 'dimension' | 'color';
  $value: string;
  $description?: string;
}

export type ColorTokenNode = ColorToken | { [key: string]: ColorTokenNode };

export interface ToastToken {
  $type: 'number';
  $value: number;
  $description?: string;
}

export interface DesignTokens {
  color?: Record<string, ColorTokenNode>;
  typography?: Record<string, TypographyToken>;
  spacing?: Record<string, SpacingToken | Record<string, SpacingToken>>;
  shadow?: Record<string, ShadowToken>;
  motion?: Record<string, MotionToken>;
  border?: Record<string, BorderToken>;
  zIndex?: Record<string, ZIndexToken>;
  opacity?: Record<string, OpacityToken>;
  breakpoint?: Record<string, SpacingToken>;
  /** Timing / capacity tokens from tokens/toast.json (DTCG number leaves). */
  toast?: Record<string, ToastToken>;
}

/**
 * Runtime guards for the design token type module.

 * These guards enforce the invariants that the TypeScript interfaces above
 * describe at compile time, so that untrusted or partially loaded token
 * payloads (e.g. from JSON files or remote sources) cannot silently produce
 * invalid or inconsistent state.

 * Invariants:
 * - A design token object must be a non-null, non-array object.
 * - Every token must declare a `${type}` that matches its group and a
 *   `'${value}` whose primitive type is consistent with that `$type`.
 * - Numeric tokens (`number`, `duration`, `cubicBezier`) must be finite.
 * - @type `color` tokens must carry a non-empty string `@value`.
 * - @type `shadow` tokens must carry a layer or non-empty array of layers.
 * - The container must be a plain object whose known groups are objects.
 */

export type TokenValidationResult =
  | { ok: true }
  | { ok: false; error: string; path?: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fail(error: string, path?: string): TokenValidationResult {
  return path === undefined ? { ok: false, error } : { ok: false, error, path };
}

function joinPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

/**
 * Validate a single token node against the `$type`/`$value` invariants.
 * Returns a discriminated result so callers can report actionable errors
 * without throwing.
 */
export function validateTokenNode(
  node: unknown,
  expectedType?: string,
  path = '',
): TokenValidationResult {
  if (!isPlainObject(node)) {
    return fail('token must be a non-null object', path);
  }

  const type = node.$type;
  if (type !== 'color' && type !== 'typography' && type !== 'dimension' && type !== 'shadow' && type !== 'duration' && type !== 'cubicBezier' && type !== 'number') {
    return fail(`unsupported token ${type}` ${type}` : ''}`, path);
  }

  if (expectedType !== undefined && type !== expectedType) {
    return fail(`expected $type ${expectedType} but got ${type}`, path);
  }

  if (!('$value' in node)) {
    return fail('token is missing $value', path);
  }

  const value = node.$value;

  switch (type) {
    case 'color':
      if (typeof value !== 'string' || value.trim() === '') {
        return fail('color token $value must be a non-empty string', path);
      }
      break;
    case 'dimension':
      if (typeof value !== 'string' || value.trim() === '') {
        return fail('dimension token $value must be a non-empty string', path);
      }
      break;
    case 'number':
      if (!isFiniteNumber(value)) {
        return fail('number token $value must be a finite number', path);
      }
      break;
    case 'duration':
      if (!(typeof value === 'string' || isFiniteNumber(value))) {
        return fail('duration token $value must be a string or finite number', path);
      }
      break;
    case 'cubicBezier':
      if (!Array.isArray(value) || value.length !== 4 || !value.every(isFiniteNumber)) {
        return fail('cubicBezier token $value must be an array of 4 finite numbers', path);
      }
      break;
    case 'shadow':
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return fail('shadow token $value array must not be empty', path);
        }
        for (const layer of value) {
          if (!isPlainObject(layer)) {
            return fail('shadow layer must be an object', path);
          }
        }
      } else if (!isPlainObject(value)) {
        return fail('shadow token $value must be a layer or an array of layers', path);
      }
      break;
    case 'typography':
      if (!isPlainObject(value)) {
        return fail('typography token $value must be an object', path);
      }
      break;
  }

  return { ok: true };
}

/**
 * Validate a full design token container. Returns the first failure as a
 * discriminated result so callers can surface diagnostic errors without
 * exposing token contents.
 */
export function validateDesignTokens(tokens: unknown): TokenValidationResult {
  if (!isPlainObject(tokens)) {
    return fail('design tokens must be a non-null object');
  }

  const groups: Record<string, string> = {
    color: 'color',
    typography: 'typography',
    spacing: 'dimension',
    shadow: 'shadow',
    motion: 'duration',
    border: 'dimension',
    zIndex: 'number',
    opacity: 'number',
    breakpoint: 'dimension',
    toast: 'number',
  };

  for (const [key, value] of Object.entries(tokens)) {
    if (!(key in groups)) {
      continue;
    }
    if (!isPlainObject(value)) {
      return fail(`token group ${key} must be an object`, key);
    }
    const expectedType = groups[key];
    for (const [name, node] of Object.entries(value)) {
      const nodePath = joinPath(key, name);
      if (isPlainObject(node) && !('$value' in node) && !('$type' in node)) {
        // Nested group (e.g. spacing.container). Validate each leaf.
        for (const [leafName, leaf] of Object.entries(node)) {
          const result = validateTokenNode(leaf, expectedType, joinPath(nodePath, leafName));
          if (!result.ok) return result;
        }
        continue;
      }
      const result = validateTokenNode(node, expectedType, nodePath);
      if (!result.ok) return result;
    }
  }

  return { ok: true };
}
