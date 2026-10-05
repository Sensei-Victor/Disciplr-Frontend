import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NavLink from '../NavLink';

function renderNav(to: string, currentPath: string, className = '', ariaLabel?: string) {
  return render(
    <MemoryRouter initialEntries={[currentPath]}>
      <NavLink to={to} className={className} ariaLabel={ariaLabel}>
        Link
      </NavLink>
    </MemoryRouter>,
  );
}

describe('NavLink', () => {
  it('is active with aria-current="page" when to matches the current path', () => {
    renderNav('/dashboard', '/dashboard');
    const link = screen.getByRole('link');
    expect(link).toHaveClass('active');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('is active when current path starts with to (non-root)', () => {
    renderNav('/vaults', '/vaults/123');
    const link = screen.getByRole('link');
    expect(link).toHaveClass('active');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('is inactive when to does not match the current path', () => {
    renderNav('/dashboard', '/vaults');
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('active');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('root "/" is active only on exact "/" path', () => {
    renderNav('/', '/');
    expect(screen.getByRole('link')).toHaveClass('active');
  });

  it('root "/" is inactive on a non-root path', () => {
    renderNav('/', '/dashboard');
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('active');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('forwards className and combines it with active class', () => {
    renderNav('/vaults', '/vaults', 'nav-item');
    const link = screen.getByRole('link');
    expect(link).toHaveClass('nav-item');
    expect(link).toHaveClass('active');
    expect(link.className).toBe('nav-item active');
  });

  it('forwards ariaLabel prop', () => {
    renderNav('/vaults', '/vaults', '', 'Go to vaults');
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', 'Go to vaults');
  });

  it('produces no leading/trailing spaces when className is empty and inactive', () => {
    renderNav('/dashboard', '/vaults');
    expect(screen.getByRole('link').className).toBe('');
  });

  it('produces no leading/trailing spaces when className is empty and active', () => {
    renderNav('/vaults', '/vaults');
    expect(screen.getByRole('link').className).toBe('active');
  });

  it('is active when to is an object with a matching pathname', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <NavLink to={{ pathname: '/dashboard' }}>Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveClass('active');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('is active with object to when current path starts with pathname', () => {
    render(
      <MemoryRouter initialEntries={['/vaults/123']}>
        <NavLink to={{ pathname: '/vaults' }}>Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveClass('active');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('is inactive when object to pathname does not match', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <NavLink to={{ pathname: '/vaults' }}>Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('active');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('root pathname in object to is active only on exact "/" path', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavLink to={{ pathname: '/' }}>Link</NavLink>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveClass('active');
  });

  it('root pathname in object to is inactive on a non-root path', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <NavLink to={{ pathname: '/' }}>Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('active');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('partial prefix of to does NOT make to active (to is the prefix, not the path)', () => {
    renderNav('/vaults', '/vault');
    expect(screen.getByRole('link')).not.toHaveClass('active');
  });

  it('is active when to is an object with search and hash parameters', () => {
    render(
      <MemoryRouter initialEntries={['/vaults/detail']}>
        <NavLink to={{ pathname: '/vaults', search: '?tab=overview', hash: '#summary' }}>Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveClass('active');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('is inactive when object to has undefined pathname', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <NavLink to={{ pathname: undefined }}>Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('active');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('is inactive when object to has empty pathname', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <NavLink to={{ pathname: '' }}>Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('active');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('is inactive on root path when object to has undefined pathname', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavLink to={{ pathname: undefined }}>Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).not.toHaveClass('active');
    expect(link).not.toHaveAttribute('aria-current');
  });
});
