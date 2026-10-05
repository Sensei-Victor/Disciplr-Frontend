/**
 * Typography utility for mapping design token roles to CSS classes
 * 
 * @example
 * const displayClass = getTypographyClass('display');
 */

export type TypographyRole = 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'mono';

const TYPOGRAPHY_CLASSES: Readonly<Record<TypographyRole, string>> = Object.freeze({
  display: 'text-display',
  title: 'text-title',
  subtitle: 'text-subtitle',
  body: 'text-body',
  caption: 'text-caption',
  mono: 'text-mono',
});

/**
 * Immutable mapping of typography roles to CSS classes
 * Frozen to prevent runtime modifications that could break invariants
 */
const CLASS_MAP = Object.freeze({
  display: 'text-display',
  title: 'text-title',
  subtitle: 'text-subtitle',
  body: 'text-body',
  caption: 'text-caption',
  mono: 'text-mono',
} as const satisfies Record<TypographyRole, string>);

/**
 * Default fallback class for invalid inputs
 * Ensures UI degrades gracefully rather than breaking
 */
const DEFAULT_CLASS = 'text-body' as const;

/**
 * Maps a typography role to its corresponding CSS class
 * The class automatically handles responsive scaling via CSS variables
 * 
 * Invariants:
 * - Always returns a non-empty string
 * - Returns consistent class name for the same valid role
 * - Gracefully degrades to body text for invalid inputs
 * - Thread-safe and deterministic
 * 
 * @param role - The typography role: display, title, subtitle, body, caption, or mono
 * @returns CSS class name for the role, or default fallback for invalid inputs
 */
export function getTypographyClass(role: TypographyRole): string {
  // Input validation: handle runtime type bypasses and ensure role is defined
  if (typeof role !== 'string' || !role) {
    return DEFAULT_CLASS;
  }

  // Bounds checking: verify role exists in our mapping
  const className = CLASS_MAP[role as keyof typeof CLASS_MAP];
  
  // Invariant enforcement: always return a valid CSS class
  if (typeof className !== 'string' || !className) {
    return DEFAULT_CLASS;
  }

  return className;
}

/**
 * Validates that a given string is a valid typography role
 * Useful for runtime type checking and input validation
 * 
 * @param value - Value to check
 * @returns true if value is a valid TypographyRole
 */
export function isValidTypographyRole(value: unknown): value is TypographyRole {
  return typeof value === 'string' && value in CLASS_MAP;
}

/**
 * Gets all valid typography roles
 * Useful for validation, iteration, and testing
 * 
 * @returns Array of all valid typography roles
 */
export function getValidTypographyRoles(): readonly TypographyRole[] {
  return Object.freeze(Object.keys(CLASS_MAP) as TypographyRole[]);
}

