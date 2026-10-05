import React from 'react'
import { getTypographyClass } from '../utils/typography'
import type { TypographyRole } from '../utils/typography'
import { logger } from '../utils/logger'

export const VALID_TYPOGRAPHY_ROLES: readonly TypographyRole[] = Object.freeze([
  'display',
  'title',
  'subtitle',
  'body',
  'caption',
  'mono',
])

export const DEFAULT_TYPOGRAPHY_ROLE: TypographyRole = 'body'

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  /** Typography role determining size and weight */
  role: TypographyRole
  /** HTML element to render as (default: 'span') */
  as?: keyof JSX.IntrinsicElements | React.ElementType
  /** Child content */
  children?: React.ReactNode
}

/**
 * Text component for applying consistent typography scales
 * 
 * Automatically handles responsive sizing across sm/md/lg breakpoints.
 * Uses CSS variables that update based on viewport width.
 * 
 * Invariants:
 * - Deterministic fallback to 'body' role when an invalid, null, or empty role is provided.
 * - Element tag defaults to 'span' if `as` is undefined, null, or empty string.
 * - Deduplicates classes so identical utility classes are not duplicated in the DOM.
 * - Safely handles boundary children (e.g. 0, empty string, null, undefined).
 * - Forwards refs to the underlying DOM element or component.
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ role, as: asProp = 'span', className, children, ...props }, ref) => {
    // Validate role input with safe fallback and diagnostic logging
    let effectiveRole: TypographyRole = role
    if (!role || !VALID_TYPOGRAPHY_ROLES.includes(role)) {
      logger.warn(`Invalid or missing typography role "${String(role)}", falling back to "${DEFAULT_TYPOGRAPHY_ROLE}"`)
      effectiveRole = DEFAULT_TYPOGRAPHY_ROLE
    }

    const typographyClass = getTypographyClass(effectiveRole)

    // Determine target element with fallback to 'span' for invalid/falsy `as`
    // Strings must be a plain tag name (e.g. rejects "<script>"); non-strings must
    // be a component type (function / forwardRef / memo object). Anything else,
    // including empty or falsy values, renders a span.
    const trimmedAs = typeof asProp === 'string' ? asProp.trim() : ''
    const Component = typeof asProp === 'string'
      ? (/^[a-zA-Z0-9-]+$/.test(trimmedAs) ? trimmedAs : 'span')
      : (asProp && (typeof asProp === 'function' || typeof asProp === 'object'))
        ? asProp
        : 'span'

    // Class name normalization and deduplication
    let mergedClassName = typographyClass
    if (className && typeof className === 'string') {
      const classTokens = className.trim().split(/\s+/).filter(Boolean)
      const tokenSet = new Set<string>()
      tokenSet.add(typographyClass)
      for (const token of classTokens) {
        tokenSet.add(token)
      }
      mergedClassName = Array.from(tokenSet).join(' ')
    }

    return React.createElement(Component as React.ElementType, {
      ref,
      className: mergedClassName,
      ...props,
      children,
    })
  }
)

Text.displayName = 'Text'
