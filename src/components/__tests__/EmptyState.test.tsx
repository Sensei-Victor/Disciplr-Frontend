import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('renders action button and handles click', () => {
    const fn = vi.fn();
    render(<EmptyState title="Empty" action={{ label: 'Reset', onClick: fn }} />);
    fireEvent.click(screen.getByText('Reset'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByText('Nothing here')).toBeNull();
  });

  it('renders button with explicit type="button"', () => {
    render(<EmptyState title="Empty" action={{ label: 'Reset', onClick: () => {} }} />);
    const button = screen.getByRole('button', { name: 'Reset' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('does not trigger form submit when rendered inside a form and clicked', () => {
    const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const handleClick = vi.fn();

    render(
      <form onSubmit={handleSubmit}>
        <EmptyState title="Empty" action={{ label: 'Reset', onClick: handleClick }} />
      </form>
    );

    const button = screen.getByRole('button', { name: 'Reset' });
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('supports custom button type when explicitly provided', () => {
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Submit Query', onClick: () => {}, type: 'submit' }}
      />
    );
    const button = screen.getByRole('button', { name: 'Submit Query' });
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('does not submit form when rendered alongside input fields and sibling submit buttons', () => {
    const handleSubmit = vi.fn((e) => e.preventDefault());
    const handleActionClick = vi.fn();

    render(
      <form onSubmit={handleSubmit}>
        <input type="text" name="search" defaultValue="test query" />
        <EmptyState
          title="No results found"
          description="Try modifying your search"
          action={{ label: 'Clear Filters', onClick: handleActionClick }}
        />
        <button type="submit">Submit Form</button>
      </form>
    );

    const clearButton = screen.getByRole('button', { name: 'Clear Filters' });
    expect(clearButton).toHaveAttribute('type', 'button');

    fireEvent.click(clearButton);
    expect(handleActionClick).toHaveBeenCalledTimes(1);
    expect(handleSubmit).not.toHaveBeenCalled();

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    fireEvent.click(submitButton);
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders icon with aria-hidden="true" when provided', () => {
    render(
      <EmptyState
        icon={<span data-testid="custom-icon">Icon</span>}
        title="Empty"
      />
    );
    const iconContainer = screen.getByTestId('custom-icon').parentElement;
    expect(iconContainer).toHaveAttribute('aria-hidden', 'true');
    expect(iconContainer).toHaveClass('empty-state-icon');
  });

  it('supports disabled action button and prevents click propagation', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Disabled Action', onClick: handleClick, disabled: true }}
      />
    );

    const button = screen.getByRole('button', { name: 'Disabled Action' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies custom className and aria-label to action button', () => {
    render(
      <EmptyState
        title="Empty"
        className="custom-empty-class"
        action={{
          label: 'Action',
          onClick: () => {},
          className: 'custom-btn-class',
          ariaLabel: 'Perform custom action',
        }}
      />
    );

    const container = screen.getByRole('status');
    expect(container).toHaveClass('empty-state');
    expect(container).toHaveClass('custom-empty-class');

    const button = screen.getByRole('button', { name: 'Perform custom action' });
    expect(button).toHaveClass('empty-state-action');
    expect(button).toHaveClass('custom-btn-class');
  });
});
