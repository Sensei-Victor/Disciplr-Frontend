import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';
import Skeleton from '../Skeleton';

describe('Skeleton', () => {
  it('renders sensibly with no className prop at all', () => {
    render(<Skeleton />);
    const el = screen.getByTestId('skeleton');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('skeleton');
    expect(el).not.toHaveClass('undefined');
  });

  it('renders with the skeleton base class plus any custom className merged in', () => {
    render(<Skeleton className="w-10 h-10 rounded-full" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('skeleton');
    expect(el).toHaveClass('w-10');
    expect(el).toHaveClass('h-10');
    expect(el).toHaveClass('rounded-full');
  });
});

