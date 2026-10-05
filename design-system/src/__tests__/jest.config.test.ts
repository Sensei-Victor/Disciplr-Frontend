const jestConfigModule = require('../../jest.config.js');

const {
  createJestConfig,
  getJestConfig,
  validateJestConfig,
  validateThreshold,
  validateAndDeduplicateStringArray,
  validateNonEmptyString,
  DEFAULT_CONFIG,
  DEFAULT_COVERAGE_METRICS,
} = jestConfigModule;

describe('design-system/jest.config.js', () => {
  describe('Default configuration exports and compatibility', () => {
    it('exports a callable function returning a valid configuration object for Jest', () => {
      expect(typeof jestConfigModule).toBe('function');
      const invokedConfig = jestConfigModule();
      expect(invokedConfig).toBeDefined();
      expect(invokedConfig.preset).toBe('ts-jest');
      expect(invokedConfig.testEnvironment).toBe('node');
      expect(invokedConfig.roots).toEqual(['<rootDir>/src']);
      expect(invokedConfig.testMatch).toEqual([
        '**/__tests__/**/*.ts',
        '**/?(*.)+(spec|test).ts',
      ]);
      expect(invokedConfig.collectCoverageFrom).toEqual([
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/__tests__/**',
      ]);
      expect(invokedConfig.coverageThreshold).toEqual({
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      });
    });

    it('exposes default properties directly on the module for static/object consumers', () => {
      expect(jestConfigModule.preset).toBe('ts-jest');
      expect(jestConfigModule.testEnvironment).toBe('node');
      expect(jestConfigModule.roots).toEqual(['<rootDir>/src']);
      expect(jestConfigModule.testMatch).toEqual([
        '**/__tests__/**/*.ts',
        '**/?(*.)+(spec|test).ts',
      ]);
      expect(jestConfigModule.collectCoverageFrom).toEqual([
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/__tests__/**',
      ]);
      expect(jestConfigModule.coverageThreshold).toEqual({
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      });
    });

    it('provides CJS and ESM interop via default property', () => {
      expect(jestConfigModule.default).toBe(jestConfigModule);
    });

    it('exports DEFAULT_CONFIG matching the canonical configuration', () => {
      expect(DEFAULT_CONFIG).toBeDefined();
      expect(DEFAULT_CONFIG.preset).toBe('ts-jest');
      expect(DEFAULT_CONFIG.testEnvironment).toBe('node');
      expect(DEFAULT_CONFIG.coverageThreshold.global).toEqual({
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      });
    });

    it('passes full schema validation for the default exported configuration', () => {
      expect(validateJestConfig(jestConfigModule())).toBe(true);
      expect(validateJestConfig(DEFAULT_CONFIG)).toBe(true);
    });
  });

  describe('createJestConfig - Normal operation & valid overrides', () => {
    it('produces a configuration equivalent to DEFAULT_CONFIG when called with no arguments', () => {
      const config = createJestConfig();
      expect(config.preset).toBe(DEFAULT_CONFIG.preset);
      expect(config.testEnvironment).toBe(DEFAULT_CONFIG.testEnvironment);
      expect(config.roots).toEqual(DEFAULT_CONFIG.roots);
      expect(config.testMatch).toEqual(DEFAULT_CONFIG.testMatch);
      expect(config.collectCoverageFrom).toEqual(DEFAULT_CONFIG.collectCoverageFrom);
      expect(config.coverageThreshold).toEqual(DEFAULT_CONFIG.coverageThreshold);
    });

    it('supports getJestConfig alias producing identical results', () => {
      const config1 = createJestConfig();
      const config2 = getJestConfig();
      expect(config1).toEqual(config2);
    });

    it('allows overriding preset and testEnvironment with valid strings', () => {
      const custom = createJestConfig({
        preset: 'custom-preset',
        testEnvironment: 'jsdom',
      });
      expect(custom.preset).toBe('custom-preset');
      expect(custom.testEnvironment).toBe('jsdom');
    });

    it('allows valid partial overrides of coverage thresholds while retaining remaining defaults', () => {
      const custom = createJestConfig({
        coverageThreshold: {
          global: {
            branches: 90,
            lines: 85,
          },
        },
      });
      expect(custom.coverageThreshold.global).toEqual({
        branches: 90,
        functions: 80,
        lines: 85,
        statements: 80,
      });
    });

    it('allows full override of coverage thresholds', () => {
      const custom = createJestConfig({
        coverageThreshold: {
          global: {
            branches: 75,
            functions: 70,
            lines: 75,
            statements: 70,
          },
        },
      });
      expect(custom.coverageThreshold.global).toEqual({
        branches: 75,
        functions: 70,
        lines: 75,
        statements: 70,
      });
    });

    it('handles empty coverageThreshold object override without global property', () => {
      const custom = createJestConfig({
        coverageThreshold: {},
      });
      expect(custom.coverageThreshold.global).toEqual(DEFAULT_CONFIG.coverageThreshold.global);
    });

    it('preserves additional top-level Jest configuration overrides', () => {
      const custom = createJestConfig({
        verbose: true,
        testTimeout: 10000,
        bail: 1,
      });
      expect(custom.verbose).toBe(true);
      expect(custom.testTimeout).toBe(10000);
      expect(custom.bail).toBe(1);
    });
  });

  describe('Deduplication, normalization, and boundary handling', () => {
    it('deduplicates duplicate items in roots while preserving order', () => {
      const custom = createJestConfig({
        roots: ['<rootDir>/src', '<rootDir>/tokens', '<rootDir>/src'],
      });
      expect(custom.roots).toEqual(['<rootDir>/src', '<rootDir>/tokens']);
    });

    it('deduplicates duplicate patterns in testMatch', () => {
      const custom = createJestConfig({
        testMatch: ['**/__tests__/**/*.ts', '**/__tests__/**/*.ts', '**/*.spec.ts'],
      });
      expect(custom.testMatch).toEqual(['**/__tests__/**/*.ts', '**/*.spec.ts']);
    });

    it('deduplicates duplicate patterns in collectCoverageFrom', () => {
      const custom = createJestConfig({
        collectCoverageFrom: ['src/**/*.ts', 'src/**/*.ts', '!src/**/*.d.ts'],
      });
      expect(custom.collectCoverageFrom).toEqual(['src/**/*.ts', '!src/**/*.d.ts']);
    });

    it('trims leading and trailing whitespace from string array elements and single string fields', () => {
      const custom = createJestConfig({
        preset: '  ts-jest  ',
        testEnvironment: '  node  ',
        roots: ['  <rootDir>/src  '],
      });
      expect(custom.preset).toBe('ts-jest');
      expect(custom.testEnvironment).toBe('node');
      expect(custom.roots).toEqual(['<rootDir>/src']);
    });

    it('accepts boundary threshold values 0 and 100', () => {
      const minBound = createJestConfig({
        coverageThreshold: {
          global: {
            branches: 0,
            functions: 0,
            lines: 0,
            statements: 0,
          },
        },
      });
      expect(minBound.coverageThreshold.global).toEqual({
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0,
      });

      const maxBound = createJestConfig({
        coverageThreshold: {
          global: {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100,
          },
        },
      });
      expect(maxBound.coverageThreshold.global).toEqual({
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      });
    });

    it('accepts fractional threshold values between 0 and 100', () => {
      const fractional = createJestConfig({
        coverageThreshold: {
          global: {
            branches: 80.5,
            functions: 99.9,
            lines: 0.1,
            statements: 50.25,
          },
        },
      });
      expect(fractional.coverageThreshold.global.branches).toBe(80.5);
      expect(fractional.coverageThreshold.global.functions).toBe(99.9);
      expect(fractional.coverageThreshold.global.lines).toBe(0.1);
      expect(fractional.coverageThreshold.global.statements).toBe(50.25);
    });

    it('accepts single-item array boundary for roots, testMatch, and collectCoverageFrom', () => {
      const singleItem = createJestConfig({
        roots: ['<rootDir>/src'],
        testMatch: ['**/*.test.ts'],
        collectCoverageFrom: ['src/**/*.ts'],
      });
      expect(singleItem.roots).toHaveLength(1);
      expect(singleItem.testMatch).toHaveLength(1);
      expect(singleItem.collectCoverageFrom).toHaveLength(1);
    });
  });

  describe('Invalid inputs & failure path coverage', () => {
    it('rejects null or non-object overrides with TypeError', () => {
      expect(() => createJestConfig(null as any)).toThrow(TypeError);
      expect(() => createJestConfig('invalid' as any)).toThrow(TypeError);
      expect(() => createJestConfig(123 as any)).toThrow(TypeError);
      expect(() => createJestConfig([] as any)).toThrow(TypeError);
    });

    it('rejects threshold < 0 with RangeError', () => {
      expect(() =>
        createJestConfig({
          coverageThreshold: {
            global: { branches: -1 },
          },
        })
      ).toThrow(RangeError);
      expect(() => validateThreshold(-0.01, 'branches')).toThrow(RangeError);
    });

    it('rejects threshold > 100 with RangeError', () => {
      expect(() =>
        createJestConfig({
          coverageThreshold: {
            global: { branches: 100.01 },
          },
        })
      ).toThrow(RangeError);
      expect(() => validateThreshold(101, 'lines')).toThrow(RangeError);
    });

    it('rejects non-numeric threshold values with TypeError', () => {
      expect(() => validateThreshold(NaN, 'statements')).toThrow(TypeError);
      expect(() => validateThreshold(Infinity, 'statements')).toThrow(TypeError);
      expect(() => validateThreshold(-Infinity, 'statements')).toThrow(TypeError);
      expect(() => validateThreshold('80' as any, 'statements')).toThrow(TypeError);
      expect(() => validateThreshold(null as any, 'statements')).toThrow(TypeError);
      expect(() => validateThreshold(undefined as any, 'statements')).toThrow(TypeError);
      expect(() => validateThreshold({} as any, 'statements')).toThrow(TypeError);
    });

    it('rejects unknown metrics in coverageThreshold.global with RangeError', () => {
      expect(() =>
        createJestConfig({
          coverageThreshold: {
            global: { unknownMetric: 80 } as any,
          },
        })
      ).toThrow(RangeError);
    });

    it('rejects non-object coverageThreshold override with TypeError', () => {
      expect(() =>
        createJestConfig({
          coverageThreshold: null as any,
        })
      ).toThrow(TypeError);
      expect(() =>
        createJestConfig({
          coverageThreshold: 'invalid' as any,
        })
      ).toThrow(TypeError);
      expect(() =>
        createJestConfig({
          coverageThreshold: [] as any,
        })
      ).toThrow(TypeError);
    });

    it('rejects non-object coverageThreshold.global override with TypeError', () => {
      expect(() =>
        createJestConfig({
          coverageThreshold: { global: null as any },
        })
      ).toThrow(TypeError);
      expect(() =>
        createJestConfig({
          coverageThreshold: { global: 123 as any },
        })
      ).toThrow(TypeError);
    });

    it('rejects non-array roots, testMatch, or collectCoverageFrom with TypeError', () => {
      expect(() => createJestConfig({ roots: 'not-an-array' as any })).toThrow(TypeError);
      expect(() => createJestConfig({ testMatch: 123 as any })).toThrow(TypeError);
      expect(() => createJestConfig({ collectCoverageFrom: {} as any })).toThrow(TypeError);
      expect(() => validateAndDeduplicateStringArray(123 as any, 'roots')).toThrow(TypeError);
    });

    it('rejects empty arrays for roots, testMatch, or collectCoverageFrom with RangeError', () => {
      expect(() => createJestConfig({ roots: [] })).toThrow(RangeError);
      expect(() => createJestConfig({ testMatch: [] })).toThrow(RangeError);
      expect(() => createJestConfig({ collectCoverageFrom: [] })).toThrow(RangeError);
      expect(() => validateAndDeduplicateStringArray([], 'roots')).toThrow(RangeError);
    });

    it('rejects arrays containing non-string elements with TypeError', () => {
      expect(() => createJestConfig({ roots: [123 as any] })).toThrow(TypeError);
      expect(() => createJestConfig({ testMatch: [null as any] })).toThrow(TypeError);
      expect(() => createJestConfig({ collectCoverageFrom: [{} as any] })).toThrow(TypeError);
      expect(() => validateAndDeduplicateStringArray(['valid', 123 as any], 'testMatch')).toThrow(TypeError);
    });

    it('rejects arrays containing empty or whitespace-only strings with RangeError', () => {
      expect(() => createJestConfig({ roots: [''] })).toThrow(RangeError);
      expect(() => createJestConfig({ roots: ['   '] })).toThrow(RangeError);
      expect(() => createJestConfig({ testMatch: ['  '] })).toThrow(RangeError);
      expect(() => createJestConfig({ collectCoverageFrom: [''] })).toThrow(RangeError);
      expect(() => validateAndDeduplicateStringArray(['   '], 'roots')).toThrow(RangeError);
    });

    it('rejects non-string or empty preset / testEnvironment', () => {
      expect(() => createJestConfig({ preset: '' })).toThrow(RangeError);
      expect(() => createJestConfig({ preset: '   ' })).toThrow(RangeError);
      expect(() => createJestConfig({ preset: 123 as any })).toThrow(TypeError);
      expect(() => createJestConfig({ testEnvironment: '' })).toThrow(RangeError);
      expect(() => createJestConfig({ testEnvironment: null as any })).toThrow(TypeError);
      expect(() => validateNonEmptyString('', 'preset')).toThrow(RangeError);
      expect(() => validateNonEmptyString(null as any, 'preset')).toThrow(TypeError);
    });
  });

  describe('validateJestConfig standalone validation', () => {
    it('returns true for a fully valid configuration', () => {
      const valid = createJestConfig();
      expect(validateJestConfig(valid)).toBe(true);
    });

    it('throws TypeError for non-object or null input', () => {
      expect(() => validateJestConfig(null)).toThrow(TypeError);
      expect(() => validateJestConfig(undefined)).toThrow(TypeError);
      expect(() => validateJestConfig([])).toThrow(TypeError);
      expect(() => validateJestConfig('string')).toThrow(TypeError);
    });

    it('throws TypeError when coverageThreshold or global is missing', () => {
      const missingThreshold = {
        preset: 'ts-jest',
        testEnvironment: 'node',
        roots: ['<rootDir>/src'],
        testMatch: ['**/*.test.ts'],
        collectCoverageFrom: ['src/**/*.ts'],
      };
      expect(() => validateJestConfig(missingThreshold)).toThrow(TypeError);

      const missingGlobal = {
        ...missingThreshold,
        coverageThreshold: {},
      };
      expect(() => validateJestConfig(missingGlobal)).toThrow(TypeError);
    });

    it('throws TypeError or RangeError when individual threshold metrics are missing or invalid', () => {
      const incomplete = {
        preset: 'ts-jest',
        testEnvironment: 'node',
        roots: ['<rootDir>/src'],
        testMatch: ['**/*.test.ts'],
        collectCoverageFrom: ['src/**/*.ts'],
        coverageThreshold: {
          global: {
            branches: 80,
            functions: 80,
            lines: 80,
            // statements missing
          },
        },
      };
      expect(() => validateJestConfig(incomplete)).toThrow(TypeError);
    });
  });

  describe('Immutability, state isolation, idempotence & concurrency', () => {
    it('returns fresh isolated instances so mutations do not pollute subsequent calls', () => {
      const first = createJestConfig();
      first.roots.push('<rootDir>/extra');
      first.coverageThreshold.global.branches = 50;

      const second = createJestConfig();
      expect(second.roots).toEqual(['<rootDir>/src']);
      expect(second.coverageThreshold.global.branches).toBe(80);
    });

    it('does not allow mutation of DEFAULT_CONFIG', () => {
      expect(() => {
        (DEFAULT_CONFIG as any).preset = 'mutated';
      }).toThrow();

      expect(() => {
        (DEFAULT_CONFIG.coverageThreshold.global as any).branches = 0;
      }).toThrow();

      expect(DEFAULT_CONFIG.preset).toBe('ts-jest');
      expect(DEFAULT_CONFIG.coverageThreshold.global.branches).toBe(80);
    });

    it('operates deterministically across concurrent/repeated executions', () => {
      const results = Array.from({ length: 50 }, () => createJestConfig());
      for (const res of results) {
        expect(res).toEqual(DEFAULT_CONFIG);
      }
    });

    it('recovers cleanly after invalid input failures (retry safety)', () => {
      // First attempt fails with invalid threshold
      expect(() =>
        createJestConfig({
          coverageThreshold: { global: { branches: 999 } },
        })
      ).toThrow(RangeError);

      // Subsequent retry with valid input succeeds cleanly
      const retryConfig = createJestConfig({
        coverageThreshold: { global: { branches: 95 } },
      });
      expect(retryConfig.coverageThreshold.global.branches).toBe(95);
      expect(retryConfig.coverageThreshold.global.functions).toBe(80);
    });
  });
});
