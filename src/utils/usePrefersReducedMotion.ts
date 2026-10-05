import { useEffect, useState } from 'react'

function getInitialPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true
}

/**
 * Subscribes to the OS prefers-reduced-motion media query.
 *
 * @returns boolean indicating whether reduced motion is requested
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(getInitialPrefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!mediaQuery) return

    const syncPreference = (event?: MediaQueryListEvent) => {
      setPrefersReducedMotion(event ? event.matches : mediaQuery.matches === true)
    }

    syncPreference()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncPreference)
      return () => mediaQuery.removeEventListener('change', syncPreference)
    }

    const legacyQuery = mediaQuery as unknown as {
      addListener?: (fn: (e: MediaQueryListEvent) => void) => void
      removeListener?: (fn: (e: MediaQueryListEvent) => void) => void
    }
    if (typeof legacyQuery.addListener === 'function') {
      legacyQuery.addListener(syncPreference)
      return () => legacyQuery.removeListener?.(syncPreference)
    }
  }, [])

  return prefersReducedMotion
}
