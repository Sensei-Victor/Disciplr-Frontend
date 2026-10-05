import React, { useCallback, useEffect, useReducer, useRef, type HTMLAttributes } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { WalletConnectButton } from "./Wallet/WalletConnectButton";
import MobileDrawer from "./MobileDrawer";
import NavLink from "./NavLink";
import { Text } from "./Text";
import { TrustlineBanner } from "./TrustlineBanner";
import NotificationBell from "./Notification/NotificationBell";
import { ShortcutsHelp } from "./ShortcutsHelp";
import ErrorBoundary from "./ErrorBoundary";
import { ToastViewport } from "./ToastViewport";
import ThemeToggle from "./ThemeToggle";
import CommandPalette from "./CommandPalette";
import {
  DRAWER_INITIAL_STATE,
  isDrawerOpen,
  reduceDrawerState,
  shouldCloseDrawerOnRouteChange,
} from "../utils/drawerState";
import { useBreakpoint } from "../utils/useBreakpoint";
import "./Layout.css";

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * The drawer is a mobile-only surface driven by a pure reducer. The
 * invariants this component must preserve are:
 *
 * 1. All transitions go through `reduceDrawerState`, so open/close/toggle
 *    and recovery events are deterministic and idempotent.
 * 2. Route changes close the drawer only when the pathname actually
 *    changed, guarded by `shouldCloseDrawerOnRouteChange`.
 * 3. Crossing into the desktop breakpoint forces the drawer closed so the
 *    scroll lock is never left engaged behind a hidden drawer.
 * 4. When the drawer is open, the rest of the app is hidden from assistive
 *    technology and inert, so focus can never escape into background content.
 */

function isValidPathname(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/");
}

export default function Layout({ children }: LayoutProps) {
  // All drawer transitions flow through the reducer so open/close/toggle and
  // the route-change/resize recovery events are deterministic and idempotent
  // (see src/utils/drawerState.ts for the state machine and its invariants).
  const [drawerState, dispatchDrawer] = useReducer(
    reduceDrawerState,
    DRAWER_INITIAL_STATE,
  );
  const drawerIsOpen = isDrawerOpen(drawerState);
  const closeDrawer = useCallback(() => dispatchDrawer({ type: "CLOSE" }), []);
  const toggleDrawer = () => dispatchDrawer({ type: "TOGGLE"});
  const location = useLocation();

  // Deep-link / navigation recovery: close the drawer whenever the route
  // actually changes (in-app navigation, browser back/forward, deep links).
  // Guarded by shouldCloseDrawerOnRouteChange so a stale location object with
  // an unchanged pathname can never close a freshly opened drawer.
  //
  // The previous pathname is normalized through `isValidPathname` so a
  // malformed location (e.g. a missing or non-string pathname from a custom
  // router or a test double) is treated as a new route rather than silently
  // leaving the drawer open or closing it under stale state.
  const prevPathnameRef = useRef<string | null>(
    isValidPathname(location.pathname) ? location.pathname : null,
  );
  useEffect(() => {
    const prevPathname = prevPathnameRef.current;
    const nextPathname = isValidPathname(location.pathname)
      ? location.pathname
      : null;
    prevPathnameRef.current = nextPathname;

    // A malformed pathname is a failure path: we treat it as a route change
    // so the drawer cannot remain open over unknown content, but we never
    // dispatch a close when both sides are unknown (idempotent no-op).
    if (prevPathname === null && nextPathname === null) {
      return;
    }
    if (prevPathname === null || nextPathname === null) {
      dispatchDrawer({ type: "ROUTE_CHANGE" });
      return;
    }
    if (shouldCloseDrawerOnRouteChange(prevPathname, nextPathname)) {
      dispatchDrawer({ type: "ROUTE_CHANGE" });
    }
  }, [location.pathname]);

  // Resize recovery: the drawer is a mobile-only surface. When the viewport
  // crosses into the desktop breakpoint (768px+), close the drawer and release
  // the scroll lock so the desktop nav is never trapped behind a hidden drawer.
  const isDesktop = useBreakpoint("md");
  useEffect(() => {
    if (isDesktop) {
      dispatchDrawer({ type: "RESIZE_DESKTOP" });
    }
  }, [isDesktop]);

  // Failure path: a drawer that is open while the viewport is already desktop
  // would leave the scroll lock engaged with no way to close it via the
  // mobile hamburger. The reducer is the source of truth, but we also derive
  // the effective open state from `isDesktop` so a stale open state can never
  // be observed by the DOM or by the assistive technology hiding logic.
  const effectiveDrawerIsOpen = drawerIsOpen && !isDesktop;

  const backgroundAccessibilityProps = effectiveDrawerIsOpen
    ? ({ "aria-hidden": true, inert: "" } as HTMLAttributes<HTMLElement> & {
        inert: "";
      })
    : {};

  // The hamburger is only meaningful on mobile. On desktop it is hidden by CSS,
  // but we also disable it so a keyboard user cannot open a drawer that the
  // viewport will immediately force closed.
  const hamburgerDisabled = isDesktop;

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <header className="site-header">
        <div className="header-brand" {...backgroundAccessibilityProps}>
          <Link to="/" className="header-link" aria-label="Disciplr home">
            <Text role="title" as="span">
              Disciplr
            </Text>
          </Link>
          <NavLink
            to="/transactions"
            className="header-link"
            ariaLabel="Transactions"
          >
            <span className="header-transactions-label">Transactions</span>
            <span
              aria-hidden="true"
              className="header-transactions-icon"
            >
              ↗
            </span>
          </NavLink>
        </div>

        <nav
          className="desktop-nav"
          aria-label="Main navigation"
          {...backgroundAccessibilityProps}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <NavLink
              to="/"
              className="header-link"
              aria-current={location.pathname === "/" ? "page" : undefined}
            >
              <Text role="caption" as="span">
                Home
              </Text>
            </NavLink>

            <NavLink to="/dashboard" className="header-link">
              <Text role="caption" as="span">
                Dashboard
              </Text>
            </NavLink>

            <NavLink
              to="/vaults"
              className="header-link"
              aria-current={
                // "Create Vault" is its own top-level nav item with an exact
                // match below, so it must not also count as "Vaults" being
                // active (otherwise two nav links would both be "current").
                location.pathname.startsWith("/vaults") &&
                location.pathname !== "/vaults/create"
                  ? "page"
                  : undefined
              }
            >
              <Text role="caption" as="span">
                Vaults
              </Text>
            </NavLink>

            <NavLink to="/verifier" className="header-link">
              <Text role="caption" as="span">
                Verifier
              </Text>
            </NavLink>

            <NavLink
              to="/analytics"
              className="header-link"
              aria-current={
                location.pathname === "/analytics" ? "page" : undefined
              }
            >
              <Text role="caption" as="span">
                Analytics
              </Text>
            </NavLink>

            <NavLink
              to="/help"
              className="header-link"
              aria-current={location.pathname.startsWith('/help') ? 'page' : undefined}
            >
              <Text role="caption" as="span">
                Help
              </Text>
            </NavLink>

            <Link
              to="/vaults/create"
              className="header-link header-cta"
              aria-current={
                location.pathname === "/vaults/create" ? "page" : undefined
              }
            >
              Create Vault
            </Link>
            <CommandPalette />
            <NotificationBell />
            <ThemeToggle />
            <WalletConnectButton />
          </div>
        </nav>
        <div className="mobile-bell-wrapper" {...backgroundAccessibilityProps}>
          <NotificationBell />
          <ThemeToggle />
        </div>
        <button
          type="button"
          className="mobile-hamburger"
          aria-label="Open navigation menu"
          aria-controls="mobile-drawer"
          aria-expanded={effectiveDrawerIsOpen}
          disabled={hamburgerDisabled}
          onClick={toggleDrawer}
        >
          <Menu size={24} aria-hidden="true" />
        </button>
        <MobileDrawer isOpen={effectiveDrawerIsOpen} onClose={closeDrawer} />
      </header>
      <TrustlineBanner />

      <main
        {...backgroundAccessibilityProps}
        style={{
          flex: 1,
          padding: "var(--spacing-8)",
          maxWidth: "var(--container-standard)",
          margin: "0 auto",
          width: "100%",
        }}
      >
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <ShortcutsHelp />
      <ToastViewport />
    </div>
  );
}
