import { describe, it, expect } from 'vitest';
import config from '../../eslint.config.js';

describe('eslint.config', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('every entry is a plain object', () => {
    for (const entry of config) {
      expect(entry !== null && typeof entry === 'object' && !Array.isArray(entry)).toBe(true);
    }
  });

  it('ignores block covers dist, design-system, and coverage', () => {
    const ignoresEntry = config.find((c: any) => Array.isArray(c.ignores));
    expect(ignoresEntry).toBeDefined();
    const { ignores } = ignoresEntry as { ignores: string[] };
    expect(ignores).toContain('dist');
    expect(ignores.some((p: string) => p.includes('design-system'))).toBe(true);
    expect(ignores.some((p: string) => p.includes('coverage'))).toBe(true);
  });

  it('has a config block targeting JS/TS source files', () => {
    const srcBlock = config.find((c: any) => Array.isArray(c.files) && c.files.some((f: string) => f.includes('ts')));
    expect(srcBlock).toBeDefined();
  });

  it('react-hooks and react-refresh plugins are registered', () => {
    const pluginBlock = config.find((c: any) => c.plugins && c.plugins['react-hooks'] && c.plugins['react-refresh']);
    expect(pluginBlock).toBeDefined();
  });

  it('react-refresh/only-export-components rule is present', () => {
    const pluginBlock = config.find((c: any) => c.rules?.['react-refresh/only-export-components']);
    expect(pluginBlock).toBeDefined();
  });

  it('no-unused-vars is configured for TS files with underscore ignore pattern', () => {
    const tsBlock = config.find(
      (c: any) => Array.isArray(c.files) && c.files.some((f: string) => f.includes('.ts')) && c.rules?.['@typescript-eslint/no-unused-vars']
    );
    expect(tsBlock).toBeDefined();
    const rule = (tsBlock as any).rules['@typescript-eslint/no-unused-vars'];
    const [severity, options] = Array.isArray(rule) ? rule : [rule, {}];
    expect(severity).toBe('error');
    expect(options.argsIgnorePattern).toMatch(/\^_/);
    expect(options.varsIgnorePattern).toMatch(/\^_/);
  });

  it('no-explicit-any is off for test files', () => {
    const testBlock = config.find(
      (c: any) => Array.isArray(c.files) && c.files.some((f: string) => f.includes('.test.')) && c.rules?.['@typescript-eslint/no-explicit-any'] === 'off'
    );
    expect(testBlock).toBeDefined();
  });

  it('file patterns have no duplicates', () => {
    const patterns = config.flatMap((c: any) => (Array.isArray(c.files) ? c.files : []));
    const unique = new Set(patterns);
    expect(unique.size).toBe(patterns.length);
  });
});
