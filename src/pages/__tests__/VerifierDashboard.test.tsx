import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import VerifierDashboard from '../VerifierDashboard';
import { useVerifierStore, type ValidationTask } from '../../Zustand/Store';
import { CRITICAL_DAYS_THRESHOLD } from '../../utils/verifierMetrics';

vi.mock('../../Zustand/Store', () => ({
  useVerifierStore: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const pendingTasks = [
  {
    id: 'v-1',
    vaultName: 'Alpha Vault',
    owner: '0xAAAA',
    amount: '10,000 USDC',
    deadline: '2026-07-01',
    status: 'pending' as const,
    milestone: 'Phase 1',
  },
  {
    id: 'v-2',
    vaultName: 'Beta Vault',
    owner: '0xBBBB',
    amount: '5,000 USDC',
    deadline: '2026-06-23',
    status: 'pending' as const,
    milestone: 'Phase 2',
  },
];

const historyTasks = [
  {
    id: 'h-1',
    vaultName: 'Gamma Vault',
    owner: '0xCCCC',
    amount: '20,000 USDC',
    deadline: '2026-05-01',
    status: 'approved' as const,
    milestone: 'Phase 3',
    notes: 'Looks good.',
    decidedAt: '2026-05-02',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <VerifierDashboard />
    </MemoryRouter>
  );
}

describe('VerifierDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T00:00:00Z'));
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    (useVerifierStore as any).mockImplementation((selector: any) => selector( {
      pendingValidations: pendingTasks,
      validationHistory: historyTasks,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByText('Verifier Dashboard')).toBeInTheDocument();
  });

  it('renders the description text', () => {
    renderPage();
    expect(screen.getByText(/Overview of your assigned vaults/)).toBeInTheDocument();
  });

  it('renders stat cards with correct values', () => {
    renderPage();

    const totalAssignedCard = screen.getByText('Total Assigned').parentElement;
    expect(totalAssignedCard).toHaveTextContent('3');

    const pendingCard = screen.getByText('Pending Validations').parentElement;
    expect(pendingCard).toHaveTextContent('2');

    const completedCard = screen.getByText('Completed').parentElement;
    expect(completedCard).toHaveTextContent('1');
  });

  it('renders View Pending Queue button that navigates to /verifier/queue', () => {
    renderPage();
    fireEvent.click(screen.getByText('View Pending Queue'));
    expect(mockNavigate).toHaveBeenCalledWith('/verifier/queue');
  });

  it('renders View History button that navigates to /verifier/history', () => {
    renderPage();
    fireEvent.click(screen.getByText('View History'));
    expect(mockNavigate).toHaveBeenCalledWith('/verifier/history');
  });

  it('shows empty message when no pending validations exist', () => {
    (useVerifierStore as any).mockImplementation((selector: any) => selector({
      pendingValidations: [],
      validationHistory: [],
    }));
    renderPage();
    expect(screen.getByText(/no pending validations/i)).toBeInTheDocument();
  });

  it('renders urgent pending tasks', () => {
    renderPage();
    expect(screen.getByText('Alpha Vault')).toBeInTheDocument();
    expect(screen.getByText('Beta Vault')).toBeInTheDocument();
  });

  it('shows days remaining for each task', () => {
    renderPage();
    expect(screen.getByText(/10 days left/)).toBeInTheDocument();
    expect(screen.getByText(/2 days left/)).toBeInTheDocument();
  });

  it(`applies danger color for tasks with ${CRITICAL_DAYS_THRESHOLD} or fewer days remaining`, () => {
    renderPage();
    const urgentText = screen.getByText(/2 days left/);
    expect(urgentText.getAttribute('style')).toContain('var(--danger)');
  });

  it(`applies text color for tasks with more than ${CRITICAL_DAYS_THRESHOLD} days remaining`, () => {
    renderPage();
    const normalText = screen.getByText(/10 days left/);
    expect(normalText.getAttribute('style')).toContain('var(--text)');
  });

  it('navigates to task detail when Review Now is clicked', () => {
    renderPage();
    const reviewButtons = screen.getAllByText('Review Now →');
    fireEvent.click(reviewButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/verifier/queue/v-1');
  });

  it('gives each Review Now button an accessible name including the vault name', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Review Alpha Vault' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Beta Vault' })).toBeInTheDocument();
  });

  it(`shows urgency text (not just color) for tasks with ${CRITICAL_DAYS_THRESHOLD} or fewer days remaining`, () => {
    renderPage();
    const urgentContainer = screen.getByText(/2 days left/) as HTMLElement;
    expect(urgentContainer.textContent).toContain('(urgent)');
  });

  it(`does not show urgency text for tasks with more than ${CRITICAL_DAYS_THRESHOLD} days remaining`, () => {
    renderPage();
    const normalContainer = screen.getByText(/10 days left/) as HTMLElement;
    expect(normalContainer.textContent).not.toContain('(urgent)');
  });

  it('Review Now buttons have focus-visible outline class', () => {
    renderPage();
    const btn = screen.getByRole('button', { name: 'Review Alpha Vault' });
    expect(btn.className).toContain('focus-visible:outline');
  });

  it('nav buttons have focus-visible outline class', () => {
    renderPage();
    expect(screen.getByText('View Pending Queue').className).toContain('focus-visible:outline');
    expect(screen.getByText('View History').className).toContain('focus-visible:outline');
  });

  it('uses design tokens for stat cards', () => {
    renderPage();
    const statLabels = ['Total Assigned', 'Pending Validations', 'Completed'];
    statLabels.forEach((label) => {
      const card = screen.getByText(label);
      expect(card.getAttribute('style')).toContain('var(--muted)');
    });
  });

  it('uses design tokens for action buttons', () => {
    renderPage();
    const queueBtn = screen.getByText('View Pending Queue');
    expect(queueBtn.getAttribute('style')).toContain('var(--accent)');
  });

  it('does not have hardcoded color classes on the primary container', () => {
    const { container } = renderPage();
    const primaryContainer = container.firstChild as HTMLElement;
    expect(primaryContainer.className).not.toContain('bg-white');
    expect(primaryContainer.className).not.toContain('text-gray-500');
    expect(primaryContainer.className).not.toContain('text-red-600');
  });

  describe('Recent Decisions feed', () => {
    it('renders the recent decisions section heading', () => {
      renderPage();
      expect(screen.getByText('Recent Decisions')).toBeInTheDocument();
    });

    it('renders recent decisions details correctly', () => {
      renderPage();
      expect(screen.getByText('Gamma Vault')).toBeInTheDocument();
      expect(screen.getByText('Milestone: Phase 3')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('2026-05-02')).toBeInTheDocument();
    });

    it('shows empty message when no history exists', () => {
      (useVerifierStore as any).mockImplementation((selector: any) => selector( {
        pendingValidations: [],
        validationHistory: [],
      }));
      renderPage();
      expect(screen.getByText('No recent decisions found.')).toBeInTheDocument();
    });

    it('navigates to history page when View in History is clicked', () => {
      renderPage();
      const viewHistoryBtn = screen.getByRole('button', { name: 'View Gamma Vault in History' });
      fireEvent.click(viewHistoryBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/verifier/history');
    });

    it('gives each View in History button an accessible name including the vault name', () => {
      renderPage();
      expect(screen.getByRole('button', { name: 'View Gamma Vault in History' })).toBeInTheDocument();
    });

    it('View in History buttons have focus-visible outline class', () => {
      renderPage();
      const btn = screen.getByRole('button', { name: 'View Gamma Vault in History' });
      expect(btn.className).toContain('focus-visible:outline');
    });

    it('renders a maximum of 5 recent decisions', () => {
      const manyHistoryTasks = Array.from({ length: 8 }, (_, i) => ({
        id: `h-${i}`,
        vaultName: `Vault ${i}`,
        owner: '0xCCCC',
        amount: '20,000 USDC',
        deadline: '2026-05-01',
        status: i % 2 === 0 ? ('approved' as const) : ('rejected' as const),
        milestone: `Phase ${i}`,
        decidedAt: `2026-05-0${i + 1}`,
      }));

      (useVerifierStore as any).mockImplementation((selector: any) => selector({
        pendingValidations: [],
        validationHistory: manyHistoryTasks,
      }));

      renderPage();

      // Should show the first 5 (Vault 0 to Vault 4)
      expect(screen.getByText('Vault 0')).toBeInTheDocument();
      expect(screen.getByText('Vault 4')).toBeInTheDocument();
      // Should not show Vault 5 to 7
      expect(screen.queryByText('Vault 5')).not.toBeInTheDocument();
      expect(screen.queryByText('Vault 7')).not.toBeInTheDocument();
    });

    it('renders a pending task in history with the correct chip label ("Pending Validation")', () => {
      const pendingHistoryTask = {
        id: 'h-pending',
        vaultName: 'Pending Test Vault',
        owner: '0xDDDD',
        amount: '15,000 USDC',
        deadline: '2026-06-01',
        daysRemaining: 5,
        status: 'pending' as const,
        milestone: 'Phase 4',
        decidedAt: '2026-06-02',
      };

      (useVerifierStore as any).mockImplementation((selector: any) => selector( {
        pendingValidations: [],
        validationHistory: [pendingHistoryTask],
      }));

      renderPage();

      expect(screen.getByText('Pending Test Vault')).toBeInTheDocument();
      expect(screen.getByText('Pending Validation')).toBeInTheDocument();
      expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
    });

    it('renders a rejected task in history with the correct chip label ("Rejected")', () => {
      const rejectedHistoryTask = {
        id: 'h-rejected',
        vaultName: 'Rejected Test Vault',
        owner: '0xEEEE',
        amount: '8,000 USDC',
        deadline: '2026-06-01',
        daysRemaining: 5,
        status: 'rejected' as const,
        milestone: 'Phase 5',
        decidedAt: '2026-06-03',
      };

      (useVerifierStore as any).mockImplementation((selector: any) => selector({
        pendingValidations: [],
        validationHistory: [rejectedHistoryTask],
      }));

      renderPage();

      expect(screen.getByText('Rejected Test Vault')).toBeInTheDocument();
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });
  });

  describe('authorization and validation regression coverage', () => {
    it('redirects to login when the store reports an unauthenticated verifier', () => {
      (useVerifierStore as any).mockImplementation((selector: any) => selector({
        pendingValidations: pendingTasks,
        validationHistory: historyTasks,
        authorized: false,
      }));
      renderPage();
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      expect(screen.queryByText('Verifier Dashboard')).not.toBeInTheDocument();
    });

    it('renders the dashboard when the store reports an authorized verifier', () => {
      (useVerifierStore as any).mockImplementation((selector: any) => selector({
        pendingValidations: pendingTasks,
        validationHistory: historyTasks,
        authorized: true,
      }));
      renderPage();
      expect(screen.getByText('Verifier Dashboard')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalledWith('/login', expect.anything);
    });

    it('treats a missing authorization flag as authorized for backward compatibility', () => {
      renderPage();
      expect(screen.getByText('Verifier Dashboard')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled('/login', expect.anything);
    });

    it('filters out malformed pending tasks without crashing', () => {
      (useVerifierStore as any).mockImplementation((selector: any) => selector({
        pendingValidations: [
          pendingTasks[0],
          { id: 'v-bad', vaultName: '' },
          null,
          undefined,
        ],
        validationHistory: [],
      }));
      renderPage();
      expect(screen.getByText('Alpha Vault')).toBeInTheDocument();
      expect(screen.getByText('Total Assigned').parentElement).toHaveTextContent('1');
    });

    it('filters out malformed history entries without crashing', () => {
      (useVerifierStore as any).mockImplementation((selector: any) => selector( {
        pendingValidations: [],
        validationHistory: [
          historyTasks[0],
          { id: 'h-bad', vaultName: '' },
          null,
        ],
      }));
      renderPage();
      expect(screen.getByText('Gamma Vault')).toBeInTheDocument();
      expect(screen.getByText('Completed').parentElement).toHaveTextContent('1');
    });

    it('treats non-array store slices as empty without crashing', () => {
      (useVerifierStore as any).mockImplementation((selector: any) => selector({
        pendingValidations: null,
        validationHistory: undefined,
      }));
      renderPage();
      expect(screen.getByText(/no pending validations/i)).toBeInTheDocument();
      expect(screen.getByText('No recent decisions found.')).toBeInTheDocument();
    });

    it('ignores tasks with invalid deadlines when computing days remaining', () => {
      (useVerifierStore as any).mockImplementation((selector: any) => selector({
        pendingValidations: [
          {
            id: 'v-bad-deadline',
            vaultName: 'Bad Deadline Vault',
            owner: '0x0000',
            amount: '1 USDC',
            deadline: 'not-a-date',
            status: 'pending',
            milestone: 'Phase 1',
          },
        ],
        validationHistory: [],
      }));
      renderPage();
      expect(screen.getByText('Bad Deadline Vault')).toBeInTheDocument();
      expect(screen.queryByText(/NaN days left/i)).not.toBeInTheDocument();
    });

    it('does not navigate to a task detail when the task id is missing', () => {
      (useVerifierStore as any).mockImplementation((selector: any) => selector( {
        pendingValidations: [
          {
            id: '',
            vaultName: 'No ID Vault',
            owner: '0x0000',
            amount: '1 USDC',
            deadline: '2026-07-01',
            status: 'pending',
            milestone: 'Phase 1',
          },
        ],
        validationHistory: [],
      }));
      renderPage();
      expect(screen.getByText('No ID Vault')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Review No ID Vault/ })).not.toBeInTheDocument();
    });
  });
});

/**
 * Failure-path and boundary coverage for VerifierDashboard.
 *
 * The suite above exercises the happy paths; this one pins deterministic
 * behaviour for adverse inputs: malformed/partial store state, invalid and
 * boundary deadlines, list-size limits, duplicate records, status transitions,
 * and the time-based re-evaluation of urgency after the current-time hook ticks.
 */
describe('VerifierDashboard — failure paths and boundaries', () => {
  const NOW = new Date('2026-06-21T00:00:00Z');

  const task = (overrides: Partial<ValidationTask> = {}): ValidationTask => ({
    id: 'task-1',
    vaultName: 'Boundary Vault',
    owner: '0xAAAA',
    amount: '1,000 USDC',
    deadline: '2026-07-01',
    status: 'pending',
    milestone: 'Phase 1',
    ...overrides,
  });

  const mockStore = (
    pendingValidations: ValidationTask[] | undefined | null,
    validationHistory: ValidationTask[] | undefined | null,
  ) =>
    (useVerifierStore as any).mockImplementation((selector: any) =>
      selector({ pendingValidations, validationHistory }),
    );

  const statCard = (label: string) => screen.getByText(label).parentElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('malformed store state (partial failure)', () => {
    it('renders empty states and zero totals when both store slices are undefined', () => {
      mockStore(undefined, undefined);

      expect(() => renderPage()).not.toThrow();
      expect(screen.getByText(/no pending validations/i)).toBeInTheDocument();
      expect(screen.getByText('No recent decisions found.')).toBeInTheDocument();
      expect(statCard('Total Assigned')).toHaveTextContent('0');
      expect(statCard('Pending Validations')).toHaveTextContent('0');
      expect(statCard('Completed')).toHaveTextContent('0');
    });

    it('renders empty states when both store slices are null', () => {
      mockStore(null, null);

      expect(() => renderPage()).not.toThrow();
      expect(screen.getByText(/no pending validations/i)).toBeInTheDocument();
      expect(screen.getByText('No recent decisions found.')).toBeInTheDocument();
    });

    it('treats a pending slice without history as a valid partial state', () => {
      mockStore([task({ vaultName: 'Only Pending' })], undefined);

      renderPage();

      expect(screen.getByText('Only Pending')).toBeInTheDocument();
      expect(screen.getByText('No recent decisions found.')).toBeInTheDocument();
      expect(statCard('Completed')).toHaveTextContent('0');
    });
  });

  describe('deadline boundaries', () => {
    it(`marks a task exactly at the ${CRITICAL_DAYS_THRESHOLD}-day threshold as urgent`, () => {
      mockStore([task({ deadline: '2026-06-24' })], []);

      renderPage();

      const label = screen.getByText(/3 days left/);
      expect(label.getAttribute('style')).toContain('var(--danger)');
      expect(label.textContent).toContain('(urgent)');
    });

    it(`treats one day past the ${CRITICAL_DAYS_THRESHOLD}-day threshold as non-urgent`, () => {
      mockStore([task({ deadline: '2026-06-25' })], []);

      renderPage();

      const label = screen.getByText(/4 days left/);
      expect(label.getAttribute('style')).toContain('var(--text)');
      expect(label.textContent).not.toContain('(urgent)');
    });

    it('treats a deadline that is due today as urgent without crashing', () => {
      mockStore([task({ deadline: '2026-06-21' })], []);

      renderPage();

      const label = screen.getByText(/0 days left/);
      expect(label.getAttribute('style')).toContain('var(--danger)');
      expect(label.textContent).toContain('(urgent)');
    });

    it('marks overdue tasks (negative days remaining) as urgent', () => {
      mockStore([task({ deadline: '2026-06-19' })], []);

      renderPage();

      const label = screen.getByText(/-2 days left/);
      expect(label.getAttribute('style')).toContain('var(--danger)');
      expect(label.textContent).toContain('(urgent)');
      expect(screen.getByLabelText('Overdue: 1')).toBeInTheDocument();
    });

    it('renders an unparsable deadline deterministically without false urgency', () => {
      mockStore([task({ deadline: 'not-a-date' })], []);

      expect(() => renderPage()).not.toThrow();

      const label = screen.getByText(/NaN days left/);
      expect(label.getAttribute('style')).toContain('var(--text)');
      expect(label.textContent).not.toContain('(urgent)');
      expect(screen.getByLabelText('Overdue: 0')).toBeInTheDocument();
    });

    it('keeps a far-future deadline non-urgent at the upper boundary', () => {
      mockStore([task({ deadline: '2036-06-24' })], []);

      renderPage();

      const label = screen.getByText(/days left/);
      expect(label.getAttribute('style')).toContain('var(--text)');
      expect(label.textContent).not.toContain('(urgent)');
      expect(label.textContent).toMatch(/\d+ days left/);
    });
  });

  describe('list-size boundaries', () => {
    const pendingList = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        task({ id: `p-${i}`, vaultName: `Pending Vault ${i}`, deadline: '2026-07-01' }),
      );

    it('renders all three urgent tasks when exactly three are pending', () => {
      mockStore(pendingList(3), []);

      renderPage();

      expect(screen.getAllByRole('button', { name: /^Review / })).toHaveLength(3);
      expect(screen.getByText('Pending Vault 2')).toBeInTheDocument();
    });

    it('caps the urgent list at three tasks and omits the fourth', () => {
      mockStore(pendingList(4), []);

      renderPage();

      expect(screen.getAllByRole('button', { name: /^Review / })).toHaveLength(3);
      expect(screen.getByText('Pending Vault 2')).toBeInTheDocument();
      expect(screen.queryByText('Pending Vault 3')).not.toBeInTheDocument();
      expect(statCard('Pending Validations')).toHaveTextContent('4');
    });

    it('stays bounded for large lists while reporting the true total', () => {
      mockStore(pendingList(50), []);

      renderPage();

      expect(screen.getAllByRole('button', { name: /^Review / })).toHaveLength(3);
      expect(statCard('Pending Validations')).toHaveTextContent('50');
      expect(statCard('Total Assigned')).toHaveTextContent('50');
    });
  });

  describe('duplicate records', () => {
    it('renders duplicate task ids deterministically without losing a row', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStore(
        [
          task({ id: 'dup-1', vaultName: 'Duplicate Alpha' }),
          task({ id: 'dup-1', vaultName: 'Duplicate Beta' }),
        ],
        [],
      );

      renderPage();

      expect(screen.getByText('Duplicate Alpha')).toBeInTheDocument();
      expect(screen.getByText('Duplicate Beta')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Review / })).toHaveLength(2);
      consoleError.mockRestore();
    });

    it('navigates with the row-specific id when vault names collide', () => {
      mockStore(
        [
          task({ id: 'shared-1', vaultName: 'Same Name' }),
          task({ id: 'shared-2', vaultName: 'Same Name' }),
        ],
        [],
      );

      renderPage();

      const reviewButtons = screen.getAllByRole('button', { name: 'Review Same Name' });
      expect(reviewButtons).toHaveLength(2);

      fireEvent.click(reviewButtons[1]);
      expect(mockNavigate).toHaveBeenCalledWith('/verifier/queue/shared-2');
    });
  });

  describe('history regression paths', () => {
    it('falls back to the deadline when a decided task has no decision timestamp', () => {
      mockStore([], [
        task({
          id: 'h-no-decision',
          vaultName: 'No Decision Timestamp',
          status: 'approved',
          deadline: '2026-05-01',
          decidedAt: undefined,
        }),
      ]);

      renderPage();

      expect(screen.getByText('2026-05-01')).toBeInTheDocument();
    });

    it('maps a rejected decision to the rejected chip', () => {
      mockStore([], [
        task({
          id: 'h-rejected',
          vaultName: 'Rejected Vault',
          status: 'rejected',
          decidedAt: '2026-05-02',
        }),
      ]);

      renderPage();

      expect(screen.getByText('Rejected Vault')).toBeInTheDocument();
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });

    it('maps an approved decision to the approved chip', () => {
      mockStore([], [
        task({
          id: 'h-approved',
          vaultName: 'Approved Vault',
          status: 'approved',
          decidedAt: '2026-05-02',
        }),
      ]);

      renderPage();

      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    it('renders done tasks with missing optional fields without crashing', () => {
      mockStore([], [
        task({
          id: 'h-minimal',
          vaultName: 'Minimal History Vault',
          status: 'approved',
          decidedAt: undefined,
          notes: undefined,
          evidenceUrl: undefined,
          criteria: undefined,
        }),
      ]);

      expect(() => renderPage()).not.toThrow();
      expect(screen.getByText('Minimal History Vault')).toBeInTheDocument();
      expect(screen.getByText('2026-07-01')).toBeInTheDocument();
    });
  });

  describe('time-based urgency re-evaluation', () => {
    it('promotes a task to urgent once the current-time hook crosses the threshold', () => {
      mockStore([task({ id: 'tick-1', vaultName: 'Ticking Vault', deadline: '2026-06-25' })], []);

      renderPage();

      const before = screen.getByText(/4 days left/);
      expect(before.textContent).not.toContain('(urgent)');

      act(() => {
        vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      });

      const after = screen.getByText(/3 days left/);
      expect(after.getAttribute('style')).toContain('var(--danger)');
      expect(after.textContent).toContain('(urgent)');
      expect(screen.getByLabelText('Urgent: 1')).toBeInTheDocument();
    });
  });
});
