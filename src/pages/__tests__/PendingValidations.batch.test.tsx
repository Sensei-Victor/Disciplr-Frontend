import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PendingValidations from '../PendingValidations';
import { useVerifierStore, type ValidationTask } from '../../Zustand/Store';

// focus-trap-react misbehaves in jsdom; render children directly.
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const task = (id: string, vaultName: string): ValidationTask => ({
  id,
  vaultName,
  owner: '0xowner',
  amount: '1,000 USDC',
  deadline: '2026-06-01',
  status: 'pending',
  milestone: `Milestone ${id}`,
});

const seed = () => [
  task('v-1', 'Alpha Vault'),
  task('v-2', 'Beta Vault'),
  task('v-3', 'Gamma Vault'),
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <PendingValidations />
    </MemoryRouter>,
  );

const selectAll = () => screen.getByLabelText('Select all validations') as HTMLInputElement;

beforeEach(() => {
  useVerifierStore.setState({ pendingValidations: seed(), validationHistory: [] });
  mockNavigate.mockClear();
});

describe('PendingValidations — batch actions', () => {
  it('disables the action bar when nothing is selected', () => {
    renderPage();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve selected/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject selected/i })).toBeDisabled();
  });

  it('selects a single row and reflects an indeterminate header', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Select Alpha Vault'));

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(selectAll().indeterminate).toBe(true);
    expect(selectAll().checked).toBe(false);
    expect(screen.getByRole('button', { name: /approve selected/i })).toBeEnabled();
  });

  it('select-all checks every row and toggles back off', () => {
    renderPage();
    fireEvent.click(selectAll());

    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(selectAll().checked).toBe(true);
    expect(selectAll().indeterminate).toBe(false);

    fireEvent.click(selectAll());
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(selectAll().checked).toBe(false);
  });

  it('batch approves the selected tasks into history', () => {
    renderPage();
    fireEvent.click(selectAll());
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));

    // Modal shows how many tasks are affected.
    expect(screen.getByTestId('batch-affected-count')).toHaveTextContent('3');

    fireEvent.click(screen.getByRole('button', { name: /confirm approve/i }));

    const { pendingValidations, validationHistory } = useVerifierStore.getState();
    expect(pendingValidations).toHaveLength(0);
    expect(validationHistory.map((t) => t.id).sort()).toEqual(['v-1', 'v-2', 'v-3']);
    expect(validationHistory.every((t) => t.status === 'approved')).toBe(true);
    expect(screen.getByText('All caught up!')).toBeInTheDocument();
  });

  it('batch rejects only the selected tasks and carries notes to history', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Select Alpha Vault'));
    fireEvent.click(screen.getByLabelText('Select Beta Vault'));
    fireEvent.click(screen.getByRole('button', { name: /reject selected/i }));

    // Reject requires notes before confirmation is possible.
    const confirmBtn = screen.getByRole('button', { name: /confirm reject/i });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/reason for rejection/i), {
      target: { value: 'Evidence is incomplete.' },
    });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    const { pendingValidations, validationHistory } = useVerifierStore.getState();
    expect(pendingValidations.map((t) => t.id)).toEqual(['v-3']);
    expect(validationHistory.map((t) => t.id).sort()).toEqual(['v-1', 'v-2']);
    expect(validationHistory.every((t) => t.status === 'rejected')).toBe(true);
    expect(validationHistory.every((t) => t.notes === 'Evidence is incomplete.')).toBe(true);
  });

  it('clears the selection after a batch action completes', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Select Alpha Vault'));
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm approve/i }));

    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('keeps the per-row Review navigation working', () => {
    renderPage();
    const row = screen.getByText('Gamma Vault').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /review/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/verifier/queue/v-3');
  });
});

describe('PendingValidations — authorization and validation regression', () => {
  it('renders the empty state without any selection affordances', () => {
    useVerifierStore.setState({ pendingValidations: [], validationHistory: [] });
    renderPage();

    expect(screen.getByText('All caught up!')).toBeInTheDocument();
    expect(screen.queryButton(/approve selected/i)).not.toBeInTheDocument();
    expect(screen.queryButton(/reject selected/i)).not.toBeInTheDocument();
  });

  it('prevents confirming a rejection with whitespace-only notes', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Select Alpha Vault'));
    fireEvent.click(screen.getByRole('button', { name: /reject selected/i }));

    const confirmBtn = screen.getByRole('button', { name: /confirm reject/i });
    fireEvent.change(screen.getByPlaceholderText(/reason for rejection/i), {
      target: { value: '   ' },
    });
    expect(confirmBtn).toBeDisabled();

    // Store must remain unchanged while confirmation is blocked.
    const { pendingValidations, validationHistory } = useVerifierStore.getState();
    expect(pendingValidations.map((t) => t.id)).toEqual(['v-1', 'v-2', 'v-3']);
    expect(validationHistory).toHaveLength(0);
  });

  it('trims rejection notes before persisting to history', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Select Alpha Vault'));
    fireEvent.click(screen.getByRole('button', { name: /reject selected/i }));
    fireEvent.change(screen.getByPlaceholderText(/reason for rejection/i), {
      target: { value: '  Evidence is incomplete.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    const { validationHistory } = useVerifierStore.getState();
    expect(validationHistory).toHaveLength(1);
    expect(validationHistory[0].notes).toBe('Evidence is incomplete.');
  });

  it('ignores duplicate confirmation clicks and does not double-apply a batch approval', () => {
    renderPage();
    fireEvent.click(selectAll());
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));

    const confirmBtn = screen.getByRole('button', { name: /confirm approve/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    const { pendingValidations, validationHistory } = useVerifierStore.getState();
    expect(pendingValidations).toHaveLength(0);
    expect(validationHistory).toHaveLength(3);
    expect(new Set(validationHistory.map((t) => t.id)).size).toBe(3);
  });

  it('treats a stale selection as a no-op without mutating history', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Select Alpha Vault'));
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));

    // Simulate a concurrent update that removes the selected task before confirmation.
    useVerifierStore.setState({
      pendingValidations: [task('v-2', 'Beta Vault'), task('v-3', 'Gamma Vault')],
      validationHistory: [],
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm approve/i }));

    const { pendingValidations, validationHistory } = useVerifierStore.getState();
    expect(validationHistory).toHaveLength(0);
    expect(pendingValidations.map((t) => t.id)).toEqual(['v-2', 'v-3']);
  });

  it('keeps the selection bounded to the currently pending tasks when the store changes', () => {
    renderPage();
    fireEvent.click(selectAll());
    expect(screen.getByText('3 selected')).toBeInTheDocument();

    useVerifierStore.setState({
      pendingValidations: [task('v-2', 'Beta Vault')],
      validationHistory: [],
    });

    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Beta Vault')).not.toBeChecked();
  });

  it('surfaces a diagnosable error when a batch action fails and recovers on retry', async () => {
    const original = useVerifierStore.getState().approveValidations;
    const spy = vi.spyOn(useVerifierStore.getState(), 'approveValidations');
    spy.mockImplementationOnce(() => {
      throw new Error('transient failure');
    });

    try {
      renderPage();
      fireEvent.click(selectAll());
      fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /confirm approve/i }));

      // The failure must not silently mutate state.
      const afterFailure = useVerifierStore.getState();
      expect(afterFailure.pendingValidations).toHaveLength(3);
      expect(afterFailure.validationHistory).toHaveLength(0);

      // Retry succeeds and produces a consistent result.
      spy.mockImplementation(original.bind(useVerifierStore.getState()));
      fireEvent.click(screen.getByRole('button', { name: /confirm approve/i }));

      await waitFor(() => {
        const final = useVerifierStore.getState();
        expect(final.pendingValidations).toHaveLength(0);
        expect(final.validationHistory).toHaveLength(3);
      });
    } finally {
      spy.mockRestore();
    }
  });
});
