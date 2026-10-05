import React, { useState, useCallback, Component, ReactNode } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useCallback, useMemo } from 'react';
import './Layout.css';

/**
 * Valid theme preference values
 * Used for runtime validation to prevent invalid states
 */
const VALID_PREFERENCES = Object.freeze(['light', 'dark', 'system'] as const);

/**
 * Validates that a preference value is safe and expected
 * Prevents injection of malicious values that could affect UI behavior
 */
function isValidPreference(preference: unknown): preference is string {
  return typeof preference === 'string' && 
         VALID_PREFERENCES.includes(preference as any);
}

/**
 * Sanitizes and validates theme preference for safe UI operations
 * Returns fallback for invalid/malicious inputs
 */
function sanitizePreference(preference: unknown): string {
  if (isValidPreference(preference)) {
    return preference;
  }
  // Secure fallback to prevent UI corruption
  return 'light';
}

/**
 * Validates event object to prevent tampering or injection
 */
function isValidClickEvent(event: unknown): event is MouseEvent | KeyboardEvent {
  return event != null && 
         typeof event === 'object' && 
         'type' in event &&
         typeof (event as any).type === 'string';
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

/**
 * Generates accessibility label for next theme state
 * Validates input and provides secure fallback
 */
function getNextLabel(preference: unknown): string {
  const safePreference = sanitizePreference(preference);
  
  switch (safePreference) {
    case 'light':
      return 'Switch to dark mode';
    case 'dark':
      return 'Switch to system mode';
    case 'system':
      return 'Switch to light mode';
    default:
      // Should never reach here due to sanitization, but provide fallback
      return 'Switch theme';
  }
}

/**
 * Returns appropriate icon component for theme preference
 * Validates input and provides secure fallback
 */
function getIcon(preference: unknown) {
  const safePreference = sanitizePreference(preference);
  
  switch (safePreference) {
    case 'light':
      return <SunIcon />;
    case 'dark':
      return <MoonIcon />;
    case 'system':
      return <MonitorIcon />;
    default:
      // Should never reach here due to sanitization, but provide fallback
      return <SunIcon />;
  }
}

/**
 * Calculates ARIA pressed state with validation
 * Ensures state consistency and prevents injection
 */
function getAriaPressed(preference: unknown): boolean | 'mixed' {
  const safePreference = sanitizePreference(preference);
  
  switch (safePreference) {
    case 'dark':
      return true;
    case 'system':
      return 'mixed';
    case 'light':
      return false;
    default:
      // Secure fallback
      return false;
  }
}

export default function ThemeToggle() {
  // Validate context availability - will throw if not within provider
  let themeContext;
  try {
    themeContext = useTheme();
  } catch (error) {
    // Re-throw with more context for debugging
    throw new Error(
      'ThemeToggle must be rendered within a ThemeProvider. ' +
      'Ensure the component is wrapped in <ThemeProvider>.'
    );
  }

  const { preference, toggleTheme } = themeContext;

  // Validate that toggleTheme is a function to prevent runtime errors
  if (typeof toggleTheme !== 'function') {
    throw new Error(
      'Invalid ThemeContext: toggleTheme must be a function. ' +
      'Check ThemeProvider implementation.'
    );
  }

  // Memoize computed values to prevent unnecessary recalculation
  // and maintain referential stability
  const ariaLabel = useMemo(() => getNextLabel(preference), [preference]);
  const ariaPressed = useMemo(() => getAriaPressed(preference), [preference]);
  const icon = useMemo(() => getIcon(preference), [preference]);

  // Secure click handler with validation and error boundary
  const handleClick = useCallback((event: unknown) => {
    // Validate event object to prevent tampering
    if (!isValidClickEvent(event)) {
      console.warn('ThemeToggle: Invalid click event received', event);
      return;
    }

    // Prevent default to avoid any unwanted navigation or form submission
    event.preventDefault?.();

    try {
      // Call toggleTheme with error handling
      toggleTheme();
    } catch (error) {
      // Log error but don't crash the UI
      console.error('ThemeToggle: Failed to toggle theme', error);
      
      // Could emit to error tracking service here
      // errorTracker.captureException(error, { context: 'theme-toggle' });
    }
  }, [toggleTheme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={handleClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      style={{
        background: 'transparent',
        border: 'var(--border-width-1) solid var(--border)',
        borderRadius: 'var(--radius-full)',
        width: '2.5rem',
        height: '2.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isTransitioning ? 'not-allowed' : 'pointer',
        color: 'var(--text)',
        transition: 'all var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1))',
      }}
    >
      {icon}
    </button>
  );
}

export default function ThemeToggle() {
  return (
    <ThemeToggleErrorBoundary>
      <ThemeToggleInner />
    </ThemeToggleErrorBoundary>
  );
}
