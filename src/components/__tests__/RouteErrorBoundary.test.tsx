/**
 * Route-level ErrorBoundary isolation test — issue #1235
 *
 * Verifies that when a page element wrapped in its own <ErrorBoundary> throws
 * during render, the Layout's header and navigation chrome remain mounted and
 * visible. Before the fix, a single outer <ErrorBoundary> in App.tsx would
 * unmount the entire tree including the header, leaving the user with no way
 * to navigate away without a full page refresh.
 *
 * Test strategy: render Layout with an ErrorBoundary-wrapped child that throws.
 * Assert that:
 *   - the error fallback UI is shown inside <main>
 *   - the site header (banner landmark) is still in the document
 *   - the main navigation and its links are still in the document and focusable
 *   - the header brand link ("Disciplr home") is still in the document
 */

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Layout from '../Layout'
import ErrorBoundary from '../ErrorBoundary'
import { ThemeProvider } from '../../context/ThemeContext'

// Mocks required by Layout ------------------------------------------------

vi.mock('../Wallet/WalletConnectButton', () => ({
  WalletConnectButton: () => <button type="button">Connect wallet</button>,
}))

vi.mock('../TrustlineBanner', () => ({
  TrustlineBanner: () => null,
}))

vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

// A page component that unconditionally throws during render, simulating an
// unhandled runtime error in a route's page element.
function CrashingPage() {
  throw new Error('Simulated page crash')
}

function HealthyPage() {
  return <div data-testid="healthy-page">Page loaded fine</div>
}

// Render helper — mirrors the pattern used in Layout.test.tsx
function renderWithCrashingRoute(path = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Layout>
          {/* Each route element is wrapped in its own ErrorBoundary,
              mirroring the RouteErrorBoundary wrapper added to App.tsx */}
          <ErrorBoundary>
            <CrashingPage />
          </ErrorBoundary>
        </Layout>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Route-level ErrorBoundary isolation (issue #1235)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Suppress React's own console.error output for expected boundary catches
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('shows the error fallback UI inside main when the page element crashes', () => {
    renderWithCrashingRoute()

    // The boundary's fallback renders a role="alert" element
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
  })

  it('keeps the site header (banner landmark) mounted after a page crash', () => {
    renderWithCrashingRoute()

    // The <header> element has an implicit role of "banner"
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('keeps the main navigation landmark mounted and visible after a page crash', () => {
    renderWithCrashingRoute()

    expect(
      screen.getByRole('navigation', { name: /main navigation/i }),
    ).toBeInTheDocument()
  })

  it('keeps nav links accessible after a page crash so the user can navigate away', () => {
    renderWithCrashingRoute()

    const nav = screen.getByRole('navigation', { name: /main navigation/i })
    const links = nav.querySelectorAll('a')

    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => {
      expect(link).toBeInTheDocument()
      // Every link must have a non-empty accessible name
      const name =
        link.getAttribute('aria-label') ?? link.textContent?.trim() ?? ''
      expect(name.length).toBeGreaterThan(0)
    })
  })

  it('keeps the brand home link mounted after a page crash', () => {
    renderWithCrashingRoute()

    expect(
      screen.getByRole('link', { name: /disciplr home/i }),
    ).toBeInTheDocument()
  })

  it('renders healthy content normally when no crash occurs', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <Layout>
            <ErrorBoundary>
              <HealthyPage />
            </ErrorBoundary>
          </Layout>
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(screen.getByTestId('healthy-page')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: /main navigation/i }),
    ).toBeInTheDocument()
  })
})
