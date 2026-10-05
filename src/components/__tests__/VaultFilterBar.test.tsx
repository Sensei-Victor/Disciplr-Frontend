import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VaultFilterBar } from '../VaultFilterBar';
import type { VaultFilters } from '../../utils/vaultFilter';

const defaultValue: VaultFilters = { status: 'all', query: '' };

describe('VaultFilterBar', () => {
  it('renders status select and search input', () => {
    render(<VaultFilterBar value={defaultValue} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /status/i })).toBeInDocument();
    expect(screen.getByRole('searchbox', { name: /search/i })).toBeInDocument();
  });

  it('renders all status options including "All statuses"', () => {
    render(<VaultFilterBar value={defaultValue} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /status/i });
    expect(select).toHaveDisplayValue('All statuses');
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pending Validation' })).toBeInDocument();
    expect(screen.getByRole('option', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Failed' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cancelled' })).toBeInDocument();
  });

  it('reflects the current status value', () => {
    render(<VaultFilterBar value={{ status: 'active', query: '' }} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /status/i })).toHaveValue('active');
  });

  it('reflects the current query value', () => {
    render(<VaultFilterBar value={{ status: 'all', query: 'alpha' }} onChange={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue('alpha');
  });

  it('calls onChange with updated status when select changes', async () => {
    const onChange = vi.fn();
    render(<VaultFilterBar value={defaultValue} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /status/i }), 'completed');
    expect(onChange).toHaveBeenCalledWith({ status: 'completed', query: '' });
  });

  it('calls onChange with updated query when input changes', async () => {
    const onChange = vi.fn();
    render(<VaultFilterBar value={defaultValue} onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'a');
    expect(onChange).toHaveBeenLastCalledWith({ status: 'all', query: 'a' });
  });

  it('has a search landmark region', () => {
    render(<VaultFilterBar value={defaultValue} onChange={vi.fn()} />);
    expect(screen.getByRole('search', { name: /filter vaults/i })).toBeInTheDocument();
  });

  it('select is keyboard accessible', () => {
    render(<VaultFilterBar value={defaultValue} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /status/i });
    expect(select.tagName).toBe('SELECT');
  });
});
