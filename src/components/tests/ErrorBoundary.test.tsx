import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import { logger } from '../../utils/logger';

// Mock the logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  }
}));

const ThrowingComponent = () => {
  throw new Error('Test error');
};

describe('ErrorBoundary', () => {
  const originalLocation = window.location;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Suppress React's console.error about uncaught errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock window.location.reload
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });
  });

  afterEach(() => {
    // Restore window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it('renders children normally when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('renders the fallback UI when a child throws an error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/We couldn't complete that request/)).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
    
    // Default reporter should be called
    expect(logger.error).toHaveBeenCalled();
  });

  it('calls a custom onError prop instead of the default console.error reporter when supplied', () => {
    const customOnError = vi.fn();
    
    render(
      <ErrorBoundary onError={customOnError}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(customOnError).toHaveBeenCalled();
    // Default logger should not be called
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('calls window.location.reload when the Refresh button is clicked', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    expect(window.location.reload).toHaveBeenCalled();
  });
});
