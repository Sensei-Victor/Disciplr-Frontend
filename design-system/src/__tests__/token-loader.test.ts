/**
 * Focused tests for design-system/src/utils/token-loader.ts
 *
 * Coverage contract:
 *   loadTokens   — basename validation, path-traversal guard, FS error pass-through,
 *                  malformed JSON, successful parse
 *   getAllTokens  — happy-path merge of all 10 built-in files, partial failure
 *                  (one file missing, one malformed, first / last file failing),
 *                  all-fail returns empty object, warn message includes filename,
 *                  later-file key wins (Object.assign ordering)
 *   getTokenValue — empty path, missing top-level key, nested missing segment,
 *                   raw node returned when no $value, DTCG leaf node ($value),
 *                   mode-aware resolution (light / dark), non-object mid-path,
 *                   node is null mid-path
 */

import { loadTokens, getAllTokens, getTokenValue } from '../utils/token-loader';
import * as fs from 'fs';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// ── helpers ────────────────────────────────────────────────────────────────

/** Returns an fs mock that returns `json` for every file path. */
const alwaysReturn = (json: string) =>
  mockedFs.readFileSync.mockReturnValue(json as any);

/** Builds a full 10-file mock implementation.
 *  Pass `overrides` to replace the response for specific filenames. */
const tenFileMock = (
  overrides: Record<string, string | (() => never)> = {},
) => {
  const defaults: Record<string, string> = {
    'colors.json':      '{"color":"red"}',
    'typography.json':  '{"font":"sans"}',
    'spacing.json':     '{"space":"4px"}',
    'shadows.json':     '{"shadow":"1px"}',
    'motion.json':      '{"motion":"ease"}',
    'borders.json':     '{"border":"1px"}',
    'z-index.json':     '{"zIndex":100}',
    'opacity.json':     '{"opacity":0.5}',
    'breakpoints.json': '{"breakpoint":"768px"}',
    'toast.json':       '{"toast":{"maxVisible":5}}',
  };

  mockedFs.readFileSync.mockImplementation((filePath) => {
    const name = String(filePath).split(/[\\/]/).pop()!;
    if (name in overrides) {
      const override = overrides[name];
      if (typeof override === 'function') return override();
      return override as any;
    }
    return (defaults[name] ?? '{}') as any;
  });
};

// ── loadTokens ─────────────────────────────────────────────────────────────

describe('loadTokens', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── success path ──────────────────────────────────────────────────────────

  it('parses valid JSON and returns the token object', () => {
    alwaysReturn('{"color":{"primary":"red"}}');
    expect(loadTokens('colors.json')).toEqual({ color: { primary: 'red' } });
  });

  it('accepts any valid basename with .json extension', () => {
    alwaysReturn('{"x":1}');
    expect(() => loadTokens('my-tokens_v2.json')).not.toThrow();
  });

  // ── basename validation (Guard 1) ─────────────────────────────────────────

  it.each([
    '../etc/passwd',
    '../../etc/shadow',
    '/etc/passwd',
    'sub/colors.json',
    'sub\\colors.json',
    'colors.json/../../etc/passwd',
    '..\\windows\\system32\\config\\sam',
  ])('rejects path with separators: %s', (input) => {
    expect(() => loadTokens(input)).toThrow(/Invalid token file name/);
    expect(mockedFs.readFileSync).not.toHaveBeenCalled();
  });

  it.each([
    'colors',         // no extension
    'colors.txt',     // wrong extension
    '',               // empty string — fails regex (no characters before .json)
  ])('rejects non-.json or empty name: %s', (input) => {
    expect(() => loadTokens(input)).toThrow();
    expect(mockedFs.readFileSync).not.toHaveBeenCalled();
  });

  // Absolute path is rejected by the separator guard before the FS is touched.
  it('rejects absolute paths before touching the filesystem', () => {
    expect(() => loadTokens('/etc/passwd.json')).toThrow();
    expect(mockedFs.readFileSync).not.toHaveBeenCalled();
  });

  // ── FS error pass-through ─────────────────────────────────────────────────

  it('re-throws ENOENT when file does not exist', () => {
    mockedFs.readFileSync.mockImplementation(() => {
      const e = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
      throw e;
    });
    expect(() => loadTokens('missing.json')).toThrow(/ENOENT/);
  });

  // ── JSON parse failure ────────────────────────────────────────────────────

  it('throws SyntaxError for malformed JSON', () => {
    alwaysReturn('{"invalid":}');
    expect(() => loadTokens('broken.json')).toThrow(SyntaxError);
  });

  it('throws SyntaxError for completely empty file content', () => {
    alwaysReturn('');
    expect(() => loadTokens('empty.json')).toThrow(SyntaxError);
  });
});

// ── getAllTokens ───────────────────────────────────────────────────────────

describe('getAllTokens', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Silence console.warn but still allow us to assert on it.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ── happy path ────────────────────────────────────────────────────────────

  it('merges all 10 built-in token files into a single object', () => {
    tenFileMock();
    expect(getAllTokens()).toEqual({
      color:      'red',
      font:       'sans',
      space:      '4px',
      shadow:     '1px',
      motion:     'ease',
      border:     '1px',
      zIndex:     100,
      opacity:    0.5,
      breakpoint: '768px',
      toast:      { maxVisible: 5 },
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // ── partial failure — one file missing ───────────────────────────────────

  it('skips a missing file, emits one warn, and merges the rest', () => {
    tenFileMock({
      'typography.json': () => {
        throw new Error('File not found');
      },
    });
    const tokens = getAllTokens();
    expect(tokens).not.toHaveProperty('font');
    expect(tokens).toHaveProperty('color', 'red');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to load typography.json:',
      expect.any(Error),
    );
  });

  // ── partial failure — one file malformed JSON ─────────────────────────────

  it('skips a malformed file, emits one warn, and merges the rest', () => {
    tenFileMock({ 'typography.json': '{"invalid":}' });
    const tokens = getAllTokens();
    expect(tokens).not.toHaveProperty('font');
    expect(tokens).toHaveProperty('color', 'red');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to load typography.json:',
      expect.any(SyntaxError),
    );
  });

  // ── first file fails, rest continue ──────────────────────────────────────

  it('continues and merges remaining files when the first file fails', () => {
    tenFileMock({
      'colors.json': () => {
        throw new Error('File not found');
      },
    });
    const tokens = getAllTokens();
    expect(tokens).not.toHaveProperty('color');
    expect(tokens).toHaveProperty('font', 'sans');
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to load colors.json:',
      expect.any(Error),
    );
  });

  // ── last file fails, earlier files kept ──────────────────────────────────

  it('retains earlier files when the last file fails', () => {
    tenFileMock({
      'toast.json': () => {
        throw new Error('File not found');
      },
    });
    const tokens = getAllTokens();
    expect(tokens).not.toHaveProperty('toast');
    expect(tokens).toHaveProperty('color', 'red');
    expect(tokens).toHaveProperty('breakpoint', '768px');
  });

  // ── all files fail → empty object + 10 warns ─────────────────────────────

  it('returns an empty object and emits exactly one warn per file when all fail', () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('All files missing');
    });
    const tokens = getAllTokens();
    expect(tokens).toEqual({});
    // There are 10 token files in the built-in list.
    expect(warnSpy).toHaveBeenCalledTimes(10);
  });

  // ── key collision — later file wins ──────────────────────────────────────

  it('lets a later file overwrite an earlier one for the same top-level key', () => {
    // Both colors.json (position 0) and breakpoints.json (position 8) emit
    // the key 'token'; the later one must win.
    tenFileMock({
      'colors.json':      '{"token":"from-colors"}',
      'breakpoints.json': '{"token":"from-breakpoints"}',
    });
    expect(getAllTokens()).toMatchObject({ token: 'from-breakpoints' });
  });

  // ── file after a failing one is still merged ──────────────────────────────

  it('merges a file that appears after a failing one', () => {
    tenFileMock({
      'colors.json': () => {
        throw new Error('File not found');
      },
      'breakpoints.json': '{"breakpoint":"768px"}',
    });
    const tokens = getAllTokens();
    expect(tokens).toHaveProperty('breakpoint', '768px');
  });
});

// ── getTokenValue ──────────────────────────────────────────────────────────

/**
 * getTokenValue is tested against an in-memory mock of getAllTokens / loadTokens
 * so we control the full token tree without hitting the filesystem.
 */
describe('getTokenValue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Provide a consistent 10-file mock for every test.
    mockedFs.readFileSync.mockImplementation((filePath) => {
      const name = String(filePath).split(/[\\/]/).pop();
      if (name === 'colors.json') {
        return JSON.stringify({
          color: {
            primary: {
              // Mode-aware node: has both 'light' and 'dark' sub-objects each
              // containing a '$value'.
              light: { $type: 'color', $value: '#0A0A0A' },
              dark:  { $type: 'color', $value: '#F5F5F5' },
            },
            // DTCG leaf node — $value is at the top level.
            surface: { $type: 'color', $value: '#FFFFFF' },
            // Raw non-leaf node (no $value, no mode keys).
            scale: { 100: '#E0E0E0', 200: '#BDBDBD' },
          },
        }) as any;
      }
      return '{}' as any;
    });

    it('should throw a TypeError when the path is not a string', () => {
      expect(() => loadTokens(undefined as unknown as string)).toThrow(TypeError);
      expect(mockedFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should throw a TypeError when the path is an empty string', () => {
      expect(() => loadTokens('')).toThrow(TypeError);
      expect(mockedFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should reject non-object JSON payloads (array)', () => {
      mockedFs.readFileSync.mockReturnValue('[1, 2, 3]');
      expect(() => loadTokens('array.json')).toThrow(TypeError);
    });

    it('should reject non-object JSON payloads (null)', () => {
      mockedFs.readFileSync.mockReturnValue('null');
      expect(() => loadTokens('null.json')).toThrow(TypeError);
    });

    it('should reject non-object JSON payloads (primitive)', () => {
      mockedFs.readFileSync.mockReturnValue('"just-a-string"');
      expect(() => loadTokens('primitive.json')).toThrow(TypeError);
    });

    it('should throw a SyntaxError for malformed JSON', () => {
      mockedFs.readFileSync.mockReturnValue('{"invalid": }');
      expect(() => loadTokens('invalid.json')).toThrow(SyntaxError);
    });

    it('should throw when JSON is empty string', () => {
      mockedFs.readFileSync.mockReturnValue('');
      expect(() => loadTokens('empty.json')).toThrow(SyntaxError);
    });

    it('should return null when JSON parses to null', () => {
      mockedFs.readFileSync.mockReturnValue('null');
      expect(loadTokens('null.json')).toBeNull();
    });

    it('should return a primitive when JSON parses to a primitive', () => {
      mockedFs.readFileSync.mockReturnValue('42');
      expect(loadTokens('number.json')).toBe(42);
    });

    it('should return an array when JSON parses to an array', () => {
      mockedFs.readFileSync.mockReturnValue('[1,2,3]');
      expect(loadTokens('array.json')).toEqual([1, 2, 3]);
    });

    it('should propagate non-Error thrown values from readFileSync', () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw 'string failure';
      });
      expect(() => loadTokens('weird.json')).toThrow();
    });
  });

  afterEach(() => jest.restoreAllMocks());

  // ── guard: empty / falsy path ─────────────────────────────────────────────

    it('should continue and warn if a file fails to load', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('typography.json')) throw new Error('File not found');
        if (path.toString().includes('colors.json')) return '{"color": "red"}';
        if (path.toString().includes('spacing.json')) return '{"space": "4px"}';
        if (path.toString().includes('shadows.json')) return '{"shadow": "1px"}';
        if (path.toString().includes('motion.json')) return '{"motion": "ease"}';
        if (path.toString().includes('borders.json')) return '{"border": "1px"}';
        if (path.toString().includes('z-index.json')) return '{"zIndex": 100}';
        if (path.toString().includes('opacity.json')) return '{"opacity": 0.5}';
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        if (path.toString().includes('toast.json')) return '{"toast": {"maxVisible": 5}}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({
        "color": "red",
        "space": "4px",
        "shadow": "1px",
        "motion": "ease",
        "border": "1px",
        "zIndex": 100,
        "opacity": 0.5,
        "breakpoint": "768px",
        "toast": { "maxVisible": 5 }
      });
      expect(allTokens).not.toHaveProperty('font');
    });

    it('should warn with the name of the file that failed to load', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('typography.json')) throw new Error('File not found');
        return '{}';
      });

      getAllTokens();

      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to load typography.json:',
        expect.any(Error)
      );
    });

    it('should continue and warn if a file has malformed JSON', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('typography.json')) return '{"invalid": }';
        if (path.toString().includes('colors.json')) return '{"color": "red"}';
        if (path.toString().includes('spacing.json')) return '{"space": "4px"}';
        if (path.toString().includes('shadows.json')) return '{"shadow": "1px"}';
        if (path.toString().includes('motion.json')) return '{"motion": "ease"}';
        if (path.toString().includes('borders.json')) return '{"border": "1px"}';
        if (path.toString().includes('z-index.json')) return '{"zIndex": 100}';
        if (path.toString().includes('opacity.json')) return '{"opacity": 0.5}';
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        if (path.toString().includes('toast.json')) return '{"toast": {"maxVisible": 5}}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({
        "color": "red",
        "space": "4px",
        "shadow": "1px",
        "motion": "ease",
        "border": "1px",
        "zIndex": 100,
        "opacity": 0.5,
        "breakpoint": "768px",
        "toast": { "maxVisible": 5 }
      });
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to load typography.json:',
        expect.any(SyntaxError)
      );
    });

    it('should warn with SyntaxError for malformed JSON and continue', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return '{"invalid": }';
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({ breakpoint: '768px' });
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to load colors.json:',
        expect.any(SyntaxError)
      );
    });

    it('should let later files override earlier keys via Object.assign', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return '{"token": "from-colors"}';
        if (path.toString().includes('breakpoints.json')) return '{"token": "from-breakpoints"}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({"token": "from-breakpoints"});
    });

    it('should still merge a file ordered after a failing one', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) throw new Error('File not found');
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({"breakpoint": "768px"});
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to load colors.json:',
        expect.any(Error)
      );
    });

    it('should not mutate previously merged tokens when a later file fails', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return '{"color": "red"}';
        if (path.toString().includes('typography.json')) throw new Error('File not found');
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({ color: 'red' });
      expect(allTokens).not.toHaveProperty('font');
    });

    it('should handle a file returning null without throwing', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return 'null';
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({ breakpoint: '768px' });
    });

    it('should handle a file returning a primitive without throwing', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return '42';
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({ breakpoint: '768px' });
    });

    it('should handle a file returning an array without throwing', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return '[1,2,3]';
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({ breakpoint: '768px' });
    });

    it('should return an empty object and warn once per file when all files fail', () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({});
      expect(console.warn).toHaveBeenCalledTimes(9);
    });

    it('should be deterministic across repeated invocations with same inputs', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return '{"color": "red"}';
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        return '{}';
      });

      const first = getAllTokens();
      const second = getAllTokens();

      expect(first).toEqual(second);
    });
  });

  // ── missing keys ──────────────────────────────────────────────────────────

  it('returns undefined when the top-level key does not exist', () => {
    expect(getTokenValue('nonexistent')).toBeUndefined();
  });

  it('returns undefined when an intermediate segment does not exist', () => {
    expect(getTokenValue('color.primary.missing')).toBeUndefined();
  });

  it('returns undefined when traversal reaches a non-object before the end', () => {
    // color.surface.$value is '#FFFFFF' (string); trying to go deeper fails.
    expect(getTokenValue('color.surface.$value.deeper')).toBeUndefined();
  });

  // ── DTCG leaf node ($value) ───────────────────────────────────────────────

  it('returns $value directly from a DTCG leaf node', () => {
    // color.surface = { $type: 'color', $value: '#FFFFFF' }
    expect(getTokenValue('color.surface')).toBe('#FFFFFF');
  });

  it('returns $value when the path ends at a nested DTCG leaf directly', () => {
    // color.primary.light = { $type: 'color', $value: '#0A0A0A' }
    expect(getTokenValue('color.primary.light')).toBe('#0A0A0A');
  });

  it('returns the raw $value string when the full dotted path ends at $value', () => {
    // Explicit traversal all the way to the $value key.
    expect(getTokenValue('color.surface.$value')).toBe('#FFFFFF');
  });

  // ── mode-aware resolution ─────────────────────────────────────────────────

  it('resolves the light variant when mode is "light" (default)', () => {
    // color.primary has {light:{$value:'#0A0A0A'}, dark:{$value:'#F5F5F5'}}
    expect(getTokenValue('color.primary')).toBe('#0A0A0A');
  });

  it('resolves the dark variant when mode is "dark"', () => {
    expect(getTokenValue('color.primary', 'dark')).toBe('#F5F5F5');
  });

  it('falls back to the raw node when the preferred mode key is absent', () => {
    // color.scale has no mode sub-keys (and no $value), so it is returned as-is.
    const result = getTokenValue('color.scale');
    expect(result).toEqual({ 100: '#E0E0E0', 200: '#BDBDBD' });
  });

  // ── node type boundaries ──────────────────────────────────────────────────

  it('returns undefined when a mid-path node is null', () => {
    // Inject a null at color.primary to simulate a corrupted token file.
    mockedFs.readFileSync.mockImplementation(() =>
      JSON.stringify({ color: { primary: null } }) as any,
    );
    expect(getTokenValue('color.primary.light')).toBeUndefined();
  });

  it('returns undefined when a mid-path node is a primitive (string)', () => {
    mockedFs.readFileSync.mockImplementation(() =>
      JSON.stringify({ color: { primary: 'flat-string' } }) as any,
    );
    expect(getTokenValue('color.primary.light')).toBeUndefined();
  });

  it('returns a numeric $value without modification', () => {
    mockedFs.readFileSync.mockImplementation(() =>
      JSON.stringify({ zIndex: { modal: { $type: 'number', $value: 900 } } }) as any,
    );
    expect(getTokenValue('zIndex.modal')).toBe(900);
  });

  it('returns an array $value without modification', () => {
    const bezier = [0.4, 0, 0.2, 1];
    mockedFs.readFileSync.mockImplementation(() =>
      JSON.stringify({ motion: { easeInOut: { $type: 'cubicBezier', $value: bezier } } }) as any,
    );
    expect(getTokenValue('motion.easeInOut')).toEqual(bezier);
  });

  // ── no mutable state bleeds between calls ────────────────────────────────

  it('returns consistent results across repeated calls with the same mock', () => {
    const first  = getTokenValue('color.surface');
    const second = getTokenValue('color.surface');
    expect(first).toBe(second);
  });
});
