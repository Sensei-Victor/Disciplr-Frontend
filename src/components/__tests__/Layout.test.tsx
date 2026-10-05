import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import Layout from '../Layout';
import { ThemeProvider } from '../../context/ThemeContext';

vi.mock('../Wallet/WalletConnectButton', () => ({
  WalletConnectButton: () => <button type="button">Connect wallet</button>,
}));

vi.mock('../TrustlineBanner', () => ({
  TrustlineBanner: () => null,
}));

// MobileDrawer uses FocusTrap only when open; mock it so any accidental open
// in these tests doesn't break due to missing DOM focus targets.
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Layout renders <ThemeToggle />, which requires ThemeProvider context.
function renderLayout(path: string, content: ReactNode = <div>Page content</div>) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Layout>{content}</Layout>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// ---------------------------------------------------------------------------
// Existing regression tests — must keep passing
// ---------------------------------------------------------------------------
describe('Layout component navigation', () => {
  test('transactions link receives active class and aria-current when on /transactions', () => {
    renderLayout('/transactions');
    const link = screen.getByRole('link', { name: /transactions/i });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('active');
  });

  test('transactions link is not active on other routes', () => {
    renderLayout('/');
    const link = screen.getByRole('link', { name: /transactions/i });
    expect(link).not.toHaveAttribute('aria-current');
    expect(link).not.toHaveClass('active');
  });

  test('verifier link receives active class and aria-current when on /verifier', () => {
    renderLayout('/verifier');
    const link = screen.getByRole('link', { name: /verifier/i });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('active');
  });

  test('verifier link is active on verifier subroutes', () => {
    renderLayout('/verifier/queue');
    const link = screen.getByRole('link', { name: /verifier/i });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('active');
  });

  test('analytics link receives active class and aria-current when on /analytics', () => {
    renderLayout('/analytics');
    const link = screen.getByRole('link', { name: /analytics/i });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('active');
  });

  test('verifier and analytics links are not active on home route', () => {
    renderLayout('/');
    const verifierLink = screen.getByRole('link', { name: /verifier/i });
    expect(verifierLink).not.toHaveAttribute('aria-current');
    expect(verifierLink).not.toHaveClass('active');

    const analyticsLink = screen.getByRole('link', { name: /analytics/i });
    expect(analyticsLink).not.toHaveAttribute('aria-current');
    expect(analyticsLink).not.toHaveClass('active');
  });

  test('header links share the common focusable classes for keyboard users', () => {
    renderLayout('/');

    const homeLink = screen.getByRole('link', { name: /^home$/i });
    const analyticsLink = screen.getByRole('link', { name: /^analytics$/i });
    const transactionsLink = screen.getByRole('link', { name: /^transactions$/i });

    [homeLink, analyticsLink, transactionsLink].forEach((link) => {
      link.focus();
      expect(link).toHaveFocus();
      expect(link).toHaveClass('header-link');
    });

    fireEvent.keyDown(transactionsLink, { key: 'Enter' });
    expect(transactionsLink).toHaveAttribute('href', '/transactions');
  });
});

// ---------------------------------------------------------------------------
// Landmark assertions
// ---------------------------------------------------------------------------
describe('Layout header landmarks', () => {
  test('page has a banner landmark (header element)', () => {
    renderLayout('/');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  test('desktop nav is a navigation landmark with an accessible name', () => {
    renderLayout('/');
    expect(
      screen.getByRole('navigation', { name: /main navigation/i }),
    ).toBeInTheDocument();
  });

  test('page has a main landmark', () => {
    renderLayout('/');
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  // Note: NetworkMismatchBanner is not currently mounted anywhere in the app
  // (it has no consumer outside its own test file), so there is no "global
  // network mismatch banner" behavior on Layout to assert here.
});

// ---------------------------------------------------------------------------
// Accessible-name assertions for every interactive control
// ---------------------------------------------------------------------------
describe('Layout nav link and control accessible names', () => {
  test('brand home link has accessible name "Disciplr home"', () => {
    renderLayout('/');
    expect(
      screen.getByRole('link', { name: /disciplr home/i }),
    ).toBeInTheDocument();
  });

  test('brand Transactions link has accessible name', () => {
    renderLayout('/');
    expect(
      screen.getByRole('link', { name: /^transactions$/i }),
    ).toBeInTheDocument();
  });

  test('desktop nav Home link has accessible name', () => {
    renderLayout('/');
    expect(screen.getByRole('link', { name: /^home$/i })).toBeInTheDocument();
  });

  test('desktop nav Analytics link has accessible name', () => {
    renderLayout('/');
    expect(
      screen.getByRole('link', { name: /^analytics$/i }),
    ).toBeInTheDocument();
  });

  test('desktop nav Create Vault link has accessible name', () => {
    renderLayout('/');
    expect(
      screen.getByRole('link', { name: /^create vault$/i }),
    ).toBeInTheDocument();
  });

  test('every link inside the desktop nav has a non-empty accessible name', () => {
    renderLayout('/');
    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    const links = nav.querySelectorAll('a');
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      // accessible name comes from text content or aria-label
      const name =
        link.getAttribute('aria-label') ?? link.textContent?.trim() ?? '';
      expect(name.length).toBeGreaterThan(0);
    });
  });

  test('mobile hamburger button has accessible name', () => {
    renderLayout('/');
    expect(
      screen.getByRole('button', { name: /open navigation menu/i }),
    ).toBeInTheDocument();
  });

  test('wallet connect button has accessible name', () => {
    renderLayout('/');
    expect(
      screen.getByRole('button', { name: /connect wallet/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// aria-current="page" per route — only one link active at a time
// ---------------------------------------------------------------------------
describe('Layout nav aria-current per route', () => {
  test('Home link has aria-current="page" on "/"', () => {
    renderLayout('/');
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('no other desktop-nav link is active on "/"', () => {
    renderLayout('/');
    expect(
      screen.getByRole('link', { name: /^analytics$/i }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getByRole('link', { name: /^create vault$/i }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getByRole('link', { name: /^transactions$/i }),
    ).not.toHaveAttribute('aria-current');
  });

  test('Analytics link has aria-current="page" on "/analytics"', () => {
    renderLayout('/analytics');
    expect(
      screen.getByRole('link', { name: /^analytics$/i }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('no other link is active on "/analytics"', () => {
    renderLayout('/analytics');
    expect(screen.getByRole('link', { name: /^home$/i })).not.toHaveAttribute(
      'aria-current',
    );
    expect(
      screen.getByRole('link', { name: /^create vault$/i }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getByRole('link', { name: /^transactions$/i }),
    ).not.toHaveAttribute('aria-current');
  });

  test('Transactions link has aria-current="page" on "/transactions"', () => {
    renderLayout('/transactions');
    expect(
      screen.getByRole('link', { name: /^transactions$/i }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('no other link is active on "/transactions"', () => {
    renderLayout('/transactions');
    expect(screen.getByRole('link', { name: /^home$/i })).not.toHaveAttribute(
      'aria-current',
    );
    expect(
      screen.getByRole('link', { name: /^analytics$/i }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getByRole('link', { name: /^create vault$/i }),
    ).not.toHaveAttribute('aria-current');
  });

  test('Create Vault link has aria-current="page" on "/vaults/create"', () => {
    renderLayout('/vaults/create');
    expect(
      screen.getByRole('link', { name: /^create vault$/i }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('no other link is active on "/vaults/create"', () => {
    renderLayout('/vaults/create');
    expect(screen.getByRole('link', { name: /^home$/i })).not.toHaveAttribute(
      'aria-current',
    );
    expect(
      screen.getByRole('link', { name: /^analytics$/i }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getByRole('link', { name: /^transactions$/i }),
    ).not.toHaveAttribute('aria-current');
  });

  test('exactly one link carries aria-current="page" for each primary route', () => {
    const routes = ['/', '/analytics', '/transactions', '/vaults/create'];

    routes.forEach((path) => {
      const { unmount } = renderLayout(path, <div />);

      const activeLinks = screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');

      expect(activeLinks).toHaveLength(1);
      unmount();
    });
  });

  test('no link has aria-current on an unknown route', () => {
    renderLayout('/some/unknown/path');
    const activeLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(activeLinks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Mobile nav — hamburger wires up correctly to the drawer
// ---------------------------------------------------------------------------
describe('Layout mobile nav controls', () => {
  test('hamburger button references the mobile drawer via aria-controls', () => {
    renderLayout('/');
    const btn = screen.getByRole('button', { name: /open navigation menu/i });
    expect(btn).toHaveAttribute('aria-controls', 'mobile-drawer');
  });

  test('hamburger button reports aria-expanded="false" when drawer is closed', () => {
    renderLayout('/');
    const btn = screen.getByRole('button', { name: /open navigation menu/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('opening the drawer hides the background brand region and main content', () => {
    const { container } = renderLayout('/');
    const button = screen.getByRole('button', { name: /open navigation menu/i });
    const brandRegion = container.querySelector('.header-brand');
    const main = screen.getByRole('main');

    expect(brandRegion).toBeInTheDocument();
    expect(brandRegion).not.toHaveAttribute('aria-hidden');
    expect(brandRegion).not.toHaveAttribute('inert');
    expect(main).not.toHaveAttribute('aria-hidden');
    expect(main).not.toHaveAttribute('inert');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(brandRegion).toHaveAttribute('aria-hidden', 'true');
    expect(brandRegion).toHaveAttribute('inert', '');
    expect(main).toHaveAttribute('aria-hidden', 'true');
    expect(main).toHaveAttribute('inert', '');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(brandRegion).not.toHaveAttribute('aria-hidden');
    expect(brandRegion).not.toHaveAttribute('inert');
    expect(main).not.toHaveAttribute('aria-hidden');
    expect(main).not.toHaveAttribute('inert');
  });
});

// ---------------------------------------------------------------------------
// Drawer state machine integration — recovery on route change and resize
// ---------------------------------------------------------------------------
function NavigateButton({ targetPath }: { targetPath: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(targetPath)}>
      Navigate
    </button>
  );
}

function LayoutNavigationHarness({ targetPath = '/dashboard' }: { targetPath?: string }) {
  return (
    <ThemeProvider>
      <MemoryRouter initialEntries={['/']}>
        <NavigateButton targetPath={targetPath} />
        <Layout>
          <div>Page content</div>
        </Layout>
      </MemoryRouter>
    </ThemeProvider>
  );
}

type MediaQueryListener = (event: { matches: boolean; media: string }) => void;

function createMatchMediaMock() {
  const listenersByQuery = new Map<string, Set<MediaQueryListener>>();
  let desktop = false;

  return {
    setDesktop(next: boolean) {
      desktop = next;
      listenersByQuery.forEach((listeners, query) => {
        listeners.forEach((listener) => listener({ matches: next, media: query }));
      });
    },
    install() {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('min-width: 768px') ? desktop : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (_event: string, listener: MediaQueryListener) => {
          if (!listenersByQuery.has(query)) {
            listenersByQuery.set(query, new Set());
          }
          listenersByQuery.get(query)!.add(listener);
        },
        removeEventListener: (_event: string, listener: MediaQueryListener) => {
          listenersByQuery.get(query)?.delete(listener);
        },
        dispatchEvent: vi.fn(),
      }));
    },
  };
}

describe('Layout drawer state machine integration', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  test('closes the drawer when navigating to a new route (deep-link / back recovery)', async () => {
    render(<LayoutNavigationHarness />);
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: /navigation/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^navigate$/i }));

    await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-hidden');
    expect(document.body.style.overflow).toBe('');
  });

  test('navigating to the same route does not close a freshly opened drawer (stale-route guard)', () => {
    render(<LayoutNavigationHarness targetPath="/" />);
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: /^navigate$/i }));

    expect(hamburger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: /navigation/i })).toBeInTheDocument();
  });

  test('rapid hamburger clicks keep aria-expanded consistent with the rendered drawer', async () => {
    renderLayout('/');
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    fireEvent.click(hamburger);
    fireEvent.click(hamburger);

    await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-hidden');

    fireEvent.click(hamburger);

    await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('dialog', { name: /navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });

  test('closing the drawer with Escape releases scroll lock and restores focus', async () => {
    renderLayout('/');
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    hamburger.focus();
    fireEvent.click(hamburger);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(hamburger).toHaveFocus();
  });

  test('closes the drawer when the viewport crosses into the desktop breakpoint', async () => {
    const originalMatchMedia = window.matchMedia;
    const mediaQuery = createMatchMediaMock();
    mediaQuery.install();

    try {
      renderLayout('/');
      const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

      fireEvent.click(hamburger);
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');
      expect(document.body.style.overflow).toBe('hidden');

      act(() => mediaQuery.setDesktop(true));

      await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
      expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('');
      expect(screen.getByRole('main')).not.toHaveAttribute('aria-hidden');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

// ---------------------------------------------------------------------------
// Failure-path and boundary coverage
// ---------------------------------------------------------------------------
describe('Layout failure-path and boundary coverage', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  test('renders without crashing when children is null', () => {
    renderLayout('/', null);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  test('renders without crashing when children is undefined', () => {
    renderLayout('/', undefined);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  test('renders without crashing when children is an empty fragment', () => {
    renderLayout('/', <></>);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  test('renders multiple children without dropping any', () => {
    renderLayout(
      '/',
      <>
        <span data-testid="child-a">A</span>
        <span data-testid="child-b">B</span>
      </>,
    );
    expect(screen.getByTestId('child-a')).toBeInTheDocument();
    expect(screen.getByTestId('child-b')).toBeInTheDocument();
  });

  test('renders correctly on a deeply nested unknown route without active links', () => {
    renderLayout('/a/b/c/d/e/f');
    const activeLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(activeLinks).toHaveLength(0);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  test('renders correctly on a route with trailing slash', () => {
    renderLayout('/transactions/');
    const link = screen.getByRole('link', { name: /^transactions$/i });
    // Trailing slash should still resolve to the transactions route.
    expect(link).toHaveAttribute('href', '/transactions');
  });

  test('renders correctly on a route with query string and hash', () => {
    renderLayout('/analytics?tab=overview#section');
    const link = screen.getByRole('link', { name: /^analytics$/i });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  test('renders correctly on a route with URL-encoded segments', () => {
    renderLayout('/vaults/create%20vault');
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  test('repeated open/close cycles do not leak scroll lock', async () => {
    renderLayout('/');
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(hamburger);
      await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'true'));
      expect(document.body.style.overflow).toBe('hidden');

      fireEvent.click(hamburger);
      await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
      expect(document.body.style.overflow).toBe('');
    }
  });

  test('unmounting while drawer is open releases scroll lock', () => {
    const { unmount } = renderLayout('/');
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    fireEvent.click(hamburger);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });

  test('Escape key when drawer is already closed is a no-op', () => {
    renderLayout('/');
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    expect(document.body.style.overflow).toBe('');
  });

  test('Escape key with unrelated keys does not close the drawer', () => {
    renderLayout('/');
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(hamburger).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.style.overflow).toBe('hidden');
  });

  test('drawer state is idempotent across repeated Escape presses', async () => {
    renderLayout('/');
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    fireEvent.click(hamburger);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
    expect(document.body.style.overflow).toBe('');
    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument();
  });

  test('resize to desktop while drawer closed is a no-op', async () => {
    const originalMatchMedia = window.matchMedia;
    const mediaQuery = createMatchMediaMock();
    mediaQuery.install();

    try {
      renderLayout('/');
      const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

      expect(hamburger).toHaveAttribute('aria-expanded', 'false');
      act(() => mediaQuery.setDesktop(true));

      await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
      expect(document.body.style.overflow).toBe('');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test('resize back to mobile after desktop does not auto-open the drawer', async () => {
    const originalMatchMedia = window.matchMedia;
    const mediaQuery = createMatchMediaMock();
    mediaQuery.install();

    try {
      renderLayout('/');
      const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

      act(() => mediaQuery.setDesktop(true));
      act(() => mediaQuery.setDesktop(false));

      await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
      expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test('navigating away while drawer is open does not leave background inert', async () => {
    render(<LayoutNavigationHarness />);
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    fireEvent.click(hamburger);
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('inert', '');

    fireEvent.click(screen.getByRole('button', { name: /^navigate$/i }));

    await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-hidden');
  });

  test('concurrent navigation and Escape do not produce inconsistent state', async () => {
    render(<LayoutNavigationHarness />);
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });

    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /^navigate$/i }));

    await waitFor(() => expect(hamburger).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-hidden');
  });
});

// ---------------------------------------------------------------------------
// Issue #1263 — Transactions icon must not carry an inline display:none
// The show/hide logic lives entirely in Layout.css (media-query driven).
// An inline style would always win the cascade and prevent the CSS rule from
// ever revealing the icon at the intended breakpoint.
// ---------------------------------------------------------------------------
describe('Layout transactions icon — no inline style override (issue #1263)', () => {
  test('the header-transactions-icon span has no inline style attribute', () => {
    const { container } = renderLayout('/');
    const iconSpan = container.querySelector('.header-transactions-icon');
    expect(iconSpan).toBeInTheDocument();
    // The span must carry zero inline style declarations so that Layout.css's
    // media-query rule at min-width: 400px can take effect unobstructed.
    expect(iconSpan).not.toHaveAttribute('style');
  });

  test('the header-transactions-icon span does not carry an inline display value', () => {
    const { container } = renderLayout('/');
    const iconSpan = container.querySelector('.header-transactions-icon') as HTMLElement | null;
    expect(iconSpan).toBeInTheDocument();
    // Confirms no programmatic style.display has been applied — the span's
    // visibility is governed by CSS class + media query only.
    expect(iconSpan?.style.display).toBe('');
  });

  test('the header-transactions-label span also has no inline style attribute', () => {
    const { container } = renderLayout('/');
    const labelSpan = container.querySelector('.header-transactions-label');
    expect(labelSpan).toBeInTheDocument();
    expect(labelSpan).not.toHaveAttribute('style');
  });

  test('both icon and label spans are present in the DOM (CSS-only toggle, not conditional render)', () => {
    const { container } = renderLayout('/');
    // Both elements must exist so the CSS media-query can switch between them.
    // If either were conditionally removed from the DOM, the breakpoint toggle
    // would be impossible.
    expect(container.querySelector('.header-transactions-icon')).toBeInTheDocument();
    expect(container.querySelector('.header-transactions-label')).toBeInTheDocument();
  });
});
