import { loadTokens } from '../utils/token-loader';

describe('loadTokens – path traversal prevention', () => {
  const validationErrorPattern = /Invalid token file|Path traversal/;

  const expectValidationError = (fn: () => unknown) => {
    expect(fn).toThrow(expect.objectContaining({ message: expect.stringMatching(validationErrorPattern) }));
  };

  const traversalCases = [
    '../etc/passwd',
    '../../etc/shadow',
    '/etc/passwd',
    'tokens/../../etc/passwd',
    '..\\windows\\system32\\config\\sam',
    'colors.json/../../etc/passwd',
  ];

  test.each(traversalCases)('throws for "%s"', (input) => {
    expectValidationError(() => loadTokens(input));
  });

  test('throws for names with path separators', () => {
    expectValidationError(() => loadTokens('sub/colors.json'));
  });

  test('throws for names without .json extension', () => {
    expectValidationError(() => loadTokens('colors'));
  });

  test('accepts valid token file names', () => {
    // loadTokens will throw an fs error (file not found in test env), but NOT
    // our validation error – confirming the name itself passes the guard.
    const validNames = ['colors.json', 'typography.json', 'spacing.json'];
    validNames.forEach((name) => {
      expect(() => loadTokens(name)).not.toThrow(
        expect.objectContaining({ message: expect.stringMatching(validationErrorPattern) })
      );
    });
  });

  test('rejects null and undefined inputs with a validation error', () => {
    expectValidationError(() => loadTokens(null as unknown as string));
    expectValidationError(() => loadTokens(undefined as unknown as string));
  });

  test('rejects non-string inputs with a validation error', () => {
    const invalidInputs: unknown[] = [42, {}, [], true, Symbol('colors.json')];
    invalidInputs.forEach((input) => {
      expectValidationError(() => loadTokens(input as unknown as string));
    });
  });

  test('rejects empty and whitespace-only names with a validation error', () => {
    ['', '   ', '\t', '\n'].forEach((input) => {
      expectValidationError(() => loadTokens(input));
    });
  });

  test('rejects absolute and traversal paths deterministically across repeated calls', () => {
    const adversarial = ['/etc/passwd', '../secrets.json', 'a/../../b.json'];
    adversarial.forEach((input) => {
      const first = () => loadTokens(input);
      const second = () => loadTokens(input);
      expectValidationError(first);
      expectValidationError(second);
    });
  });

  test('rejects names containing null bytes or control characters', () => {
    ['colors\u0000.json', 'colors\n.json', 'colors\r.json'].forEach((input) => {
      expectValidationError(() => loadTokens(input));
    });
  });

  test('rejects case-variant traversal attempts', () => {
    ['..%2fetc%2fpasswd', '..%5cwindows%5csystem32', '%2e%2e/colors.json'].forEach((input) => {
      expectValidationError(() => loadTokens(input));
    });
  });

  test('does not leak sensitive path details in validation error messages', () => {
    const sensitive = '/etc/passwd';
    try {
      loadTokens(sensitive);
      throw new Error('expected loadTokens to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(validationErrorPattern);
      expect(message).not.toContain(sensitive);
      expect(message).not.toContain('passwd');
    }
  });

  test('concurrent validation calls are deterministic and side-effect free', async () => {
    const inputs = ['colors.json', '../etc/passwd', 'sub/colors.json', 'colors'];
    const results = await Promise.all(
      inputs.map(async (input) => {
        try {
          loadTokens(input);
          return { input, threw: false, message: '' };
        } catch (err) {
          return { input, threw: true, message: (err as Error).message };
        }
      })
    );

    const traversal = results.find((r) => r.input === '../etc/passwd');
    const separator = results.find((r) => r.input === 'sub/colors.json');
    const noExt = results.find((r) => r.input === 'colors');

    expect(traversal?.threw).toBe(true);
    expect(traversal?.message).toMatch(validationErrorPattern);
    expect(separator?.threw).toBe(true);
    expect(separator?.message).toMatch(validationErrorPattern);
    expect(noExt?.threw).toBe(true);
    expect(noExt?.message).toMatch(validationErrorPattern);
  });
});
