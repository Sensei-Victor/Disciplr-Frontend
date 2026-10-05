import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  getTypographyClass,
  isValidTypographyRole,
  getValidTypographyRoles,
  type TypographyRole,
} from '../typography';

const roleClasses: Record<TypographyRole, string> = {
  display: 'text-display',
  title: 'text-title',
  subtitle: 'text-subtitle',
  body: 'text-body',
  caption: 'text-caption',
  mono: 'text-mono',
};

describe('getTypographyClass', () => {
  describe('valid inputs', () => {
    const validCases: [TypographyRole, string][] = [
      ['display', 'text-display'],
      ['title', 'text-title'],
      ['subtitle', 'text-subtitle'],
      ['body', 'text-body'],
      ['caption', 'text-caption'],
      ['mono', 'text-mono'],
    ];

    it.each(validCases)(
      'maps role "%s" to class "%s"',
      (role, expected) => {
        expect(getTypographyClass(role)).toBe(expected);
      },
    );

    it('returns a non-empty string for every valid role', () => {
      const roles: TypographyRole[] = [
        'display', 'title', 'subtitle', 'body', 'caption', 'mono',
      ];
      roles.forEach(role => {
        const result = getTypographyClass(role);
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('returns consistent results for repeated calls with same input', () => {
      const role: TypographyRole = 'display';
      const expected = getTypographyClass(role);
      
      // Test deterministic behavior across multiple calls
      for (let i = 0; i < 10; i++) {
        expect(getTypographyClass(role)).toBe(expected);
      }
    });
  });

  describe('boundary conditions', () => {
    it('handles empty string gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('')).toBe('text-body');
    });

    it('handles undefined input gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(undefined)).toBe('text-body');
    });

    it('handles null input gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(null)).toBe('text-body');
    });

    it('handles numeric inputs gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(123)).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(0)).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(-1)).toBe('text-body');
    });

    it('handles boolean inputs gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(true)).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(false)).toBe('text-body');
    });

    it('handles object inputs gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass({})).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass({ role: 'display' })).toBe('text-body');
    });

    it('handles array inputs gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass([])).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(['display'])).toBe('text-body');
    });

    it('handles function inputs gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(() => 'display')).toBe('text-body');
    });
  });

  describe('invalid string inputs', () => {
    it('handles unknown role strings gracefully', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('unknown')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('heading')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('large')).toBe('text-body');
    });

    it('handles case-sensitive role variations', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('DISPLAY')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('Display')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('Title')).toBe('text-body');
    });

    it('handles whitespace variations', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(' display')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('display ')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(' display ')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('\tdisplay\n')).toBe('text-body');
    });

    it('handles special characters and unicode', () => {
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('display-test')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('display_test')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('displayテスト')).toBe('text-body');
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass('🎨')).toBe('text-body');
    });

    it('handles extremely long strings', () => {
      const longString = 'display'.repeat(10000);
      // @ts-expect-error Testing runtime type bypass
      expect(getTypographyClass(longString)).toBe('text-body');
    });
  });

  describe('invariant enforcement', () => {
    it('always returns a non-empty string', () => {
      // Test with property-based testing
      fc.assert(
        fc.property(fc.anything(), (input) => {
          // @ts-expect-error Testing with arbitrary inputs
          const result = getTypographyClass(input);
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('maintains consistent output for valid inputs under stress', () => {
      const role: TypographyRole = 'display';
      const expected = 'text-display';
      
      // Simulate concurrent access patterns
      const results = Array.from({ length: 1000 }, () => getTypographyClass(role));
      
      results.forEach(result => {
        expect(result).toBe(expected);
      });
    });

    it('handles memory pressure gracefully', () => {
      // Create memory pressure with large objects
      const largeObjects = Array.from({ length: 100 }, () => ({
        data: new Array(1000).fill('test'),
      }));
      
      // Function should still work correctly
      expect(getTypographyClass('display')).toBe('text-display');
      expect(getTypographyClass('body')).toBe('text-body');
      
      // Cleanup to prevent test interference
      largeObjects.length = 0;
    });
  });

  describe('thread safety simulation', () => {
    it('handles rapid concurrent calls', async () => {
      const roles: TypographyRole[] = ['display', 'title', 'body', 'caption'];
      const expectedResults = {
        display: 'text-display',
        title: 'text-title',
        body: 'text-body',
        caption: 'text-caption',
      };

      // Simulate concurrent access
      const promises = Array.from({ length: 100 }, (_, i) => {
        const role = roles[i % roles.length];
        return Promise.resolve(getTypographyClass(role));
      });

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        const role = roles[index % roles.length];
        expect(result).toBe(expectedResults[role]);
      });
    });
  });

  describe('error recovery', () => {
    it('continues to work after encountering invalid inputs', () => {
      // Mix of invalid and valid inputs
      // @ts-expect-error Testing recovery after invalid input
      expect(getTypographyClass(null)).toBe('text-body');
      expect(getTypographyClass('display')).toBe('text-display');
      
      // @ts-expect-error Testing recovery after invalid input
      expect(getTypographyClass(undefined)).toBe('text-body');
      expect(getTypographyClass('title')).toBe('text-title');
      
      // @ts-expect-error Testing recovery after invalid input
      expect(getTypographyClass({})).toBe('text-body');
      expect(getTypographyClass('body')).toBe('text-body');
    });

    it('maintains state integrity after prototype pollution attempts', () => {
      // Attempt to pollute object prototype (should not affect frozen object)
      try {
        (Object.prototype as any).display = 'hacked-class';
        expect(getTypographyClass('display')).toBe('text-display');
      } finally {
        delete (Object.prototype as any).display;
      }
    });
  });

  describe('performance characteristics', () => {
    it('executes within reasonable time bounds', () => {
      const startTime = performance.now();
      
      // Execute multiple calls
      for (let i = 0; i < 1000; i++) {
        getTypographyClass('display');
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 1000 calls within 10ms (very generous bound)
      expect(duration).toBeLessThan(10);
    });
  });
});

// ── isValidTypographyRole ─────────────────────────────────────────────────────

describe('isValidTypographyRole', () => {
  describe('valid inputs', () => {
    const validRoles: TypographyRole[] = [
      'display', 'title', 'subtitle', 'body', 'caption', 'mono',
    ];

    it.each(validRoles)('returns true for valid role "%s"', (role) => {
      expect(isValidTypographyRole(role)).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    const invalidInputs = [
      undefined,
      null,
      '',
      'invalid',
      'DISPLAY',
      ' display ',
      123,
      true,
      false,
      {},
      [],
      () => 'display',
    ];

    it.each(invalidInputs)('returns false for invalid input %p', (input) => {
      expect(isValidTypographyRole(input)).toBe(false);
    });
  });

  describe('boundary conditions', () => {
    it('handles unicode and special characters', () => {
      expect(isValidTypographyRole('displayテスト')).toBe(false);
      expect(isValidTypographyRole('🎨')).toBe(false);
      expect(isValidTypographyRole('display-test')).toBe(false);
    });

    it('is consistent with getTypographyClass behavior', () => {
      // Valid roles should return true and produce expected class
      const validRoles = getValidTypographyRoles();
      validRoles.forEach(role => {
        expect(isValidTypographyRole(role)).toBe(true);
        const className = getTypographyClass(role);
        
        // Special case: 'body' role legitimately returns 'text-body'
        if (role === 'body') {
          expect(className).toBe('text-body');
        } else {
          expect(className).not.toBe('text-body'); // Should not be fallback
        }
      });

      // Invalid inputs should return false and produce fallback class
      const invalidInputs = ['invalid', '', null, undefined];
      invalidInputs.forEach(input => {
        expect(isValidTypographyRole(input)).toBe(false);
        // @ts-expect-error Testing invalid inputs
        expect(getTypographyClass(input)).toBe('text-body');
      });
    });
  });
});

// ── getValidTypographyRoles ───────────────────────────────────────────────────

describe('getValidTypographyRoles', () => {
  it('returns all valid typography roles', () => {
    const roles = getValidTypographyRoles();
    const expected: TypographyRole[] = [
      'display', 'title', 'subtitle', 'body', 'caption', 'mono',
    ];
    
    expect(roles).toEqual(expect.arrayContaining(expected));
    expect(roles).toHaveLength(expected.length);
  });

  it('returns a readonly array', () => {
    const roles = getValidTypographyRoles();
    
    // Should be frozen to prevent modifications
    expect(Object.isFrozen(roles)).toBe(true);
  });

  it('returns consistent results across calls', () => {
    const roles1 = getValidTypographyRoles();
    const roles2 = getValidTypographyRoles();
    
    expect(roles1).toEqual(roles2);
  });

  it('all returned roles are valid for getTypographyClass', () => {
    const roles = getValidTypographyRoles();
    
    roles.forEach(role => {
      expect(isValidTypographyRole(role)).toBe(true);
      const className = getTypographyClass(role);
      
      // All should return valid CSS class names with text- prefix
      expect(className).toMatch(/^text-\w+$/); // Should match expected pattern
      
      // Special case: 'body' role legitimately returns 'text-body'
      if (role !== 'body') {
        expect(className).not.toBe('text-body'); // Should not be fallback for other roles
      } else {
        expect(className).toBe('text-body'); // 'body' should return 'text-body'
      }
    });
  });
});

// ── Integration and regression tests ──────────────────────────────────────────

describe('typography utility integration', () => {
  it('maintains backwards compatibility with existing usage', () => {
    // Test the exact usage pattern from Text component
    const role: TypographyRole = 'display';
    const typographyClass = getTypographyClass(role);
    const className = `${typographyClass} custom-class`;
    
    expect(className).toBe('text-display custom-class');
  });

  it('handles edge cases that could occur in React component usage', () => {
    // Simulate potential React prop type coercion issues
    const dynamicRole = 'display' as any;
    expect(getTypographyClass(dynamicRole)).toBe('text-display');
    
    // Simulate undefined props
    const undefinedRole = undefined as any;
    expect(getTypographyClass(undefinedRole)).toBe('text-body');
  });

  it('provides safe fallbacks for dynamic role selection', () => {
    // Simulate user input or API data driving role selection
    const userInputs = ['display', 'invalid', '', null, 'title'];
    
    const results = userInputs.map(input => {
      // @ts-expect-error Simulating dynamic input
      return getTypographyClass(input);
    });
    
    expect(results).toEqual([
      'text-display',
      'text-body',    // fallback
      'text-body',    // fallback
      'text-body',    // fallback
      'text-title',
    ]);
  });

  describe('property-based testing', () => {
    it('maintains invariants under arbitrary inputs', () => {
      fc.assert(
        fc.property(fc.anything(), (input) => {
          // @ts-expect-error Testing with arbitrary inputs
          const result = getTypographyClass(input);
          
          // Core invariants that must always hold
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
          expect(result).toMatch(/^text-\w+$/);
          
          // Should either be a known class or the fallback
          const knownClasses = [
            'text-display', 'text-title', 'text-subtitle',
            'text-body', 'text-caption', 'text-mono'
          ];
          expect(knownClasses).toContain(result);
        }),
        { numRuns: 200 }
      );
    });

    it('validation function consistency', () => {
      fc.assert(
        fc.property(fc.anything(), (input) => {
          const isValid = isValidTypographyRole(input);
          // @ts-expect-error Testing with arbitrary inputs
          const className = getTypographyClass(input);
          
          if (isValid) {
            // Valid inputs should not return the fallback class
            expect(className).not.toBe('text-body');
          } else if (typeof input === 'string' && input === 'body') {
            // Exception: 'body' is valid and returns 'text-body'
            expect(className).toBe('text-body');
          } else {
            // Invalid inputs should return the fallback class
            expect(className).toBe('text-body');
          }
        }),
        { numRuns: 200 }
      );
    });
  });

  it('does not export classifyTypography ensuring dead export surface is removed', async () => {
    const module = await import('../typography');
    expect('classifyTypography' in module).toBe(false);
  });
});
