import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ValidationDetail from '../ValidationDetail';
import { useVerifierStore } from '../../Zustand/Store';
import { getNotesDraftKey } from '../../utils/notesDraft';

// Mock focus-trap-react as it can be tricky in jsdom
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Zustand store
vi.mock('../../Zustand/Store', () => ({
  useVerifierStore: vi.fn(),
}));

const mockNavigate = vi.fn();
let mockVaultId = 'v-101';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ vaultId: mockVaultId }),
  };
});

const mockPendingValidations = [
  {
    id: 'v-101',
    vaultName: 'Test Vault',
    owner: '0x123',
    amount: '100 USDC',
    deadline: '2026-06-01',
    status: 'pending',
    milestone: 'Test Milestone',
    evidenceUrl: 'https://example.com/evidence',
  },
];

const mockPendingWithCriteria = [
  {
    ...mockPendingValidations[0],
    criteria: ['Criterion A', 'Criterion B'],
  },
];

describe('ValidationDetail Page', () => {
  const mockApproveValidation = vi.fn();
  const mockRejectValidation = vi.fn();

  /** Apply the selector-based mock for useVerifierStore. */
  function mockStore(state: Record<string, unknown>) {
    vi.mocked(useVerifierStore).mockImplementation(
      (selector: (s: unknown) => unknown) => selector(state),
    );
  }

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockVaultId = 'v-101';
    window.localStorage.clear();
    mockStore({
      pendingValidations: mockPendingValidations,
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });
  });

  it('renders task details correctly', () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByText('Review Milestone')).toBeInTheDocument();
    expect(screen.getByText('Task ID: v-101')).toBeInTheDocument();
    // Vault name legitimately appears twice (breadcrumb + Vault Summary card).
    expect(screen.getAllByText('Test Vault').length).toBeGreaterThan(0);
    expect(screen.getByText('Test Milestone')).toBeInTheDocument();
  });

  it('shows "Validation Not Found" if task does not exist', () => {
    mockStore({
      pendingValidations: [],
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-999']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByText('Validation Not Found')).toBeInTheDocument();
  });

  it('approve button is enabled when task has no criteria', () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Approve Milestone/i })).not.toBeDisabled();
  });

  it('opens confirmation modal when clicking approve (no criteria)', async () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Approve Milestone'));

    expect(screen.getByText('Confirm Validation')).toBeInTheDocument();
    expect(screen.getByText(/Approval will trigger an on-chain transaction/)).toBeInTheDocument();
  });

  it('opens confirmation modal when clicking reject', async () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Reject Milestone'));

    expect(screen.getByText('Confirm Validation')).toBeInTheDocument();
    expect(screen.getByText(/Rejection will notify the vault owner/)).toBeInTheDocument();
  });

  it('executes approveValidation and navigates back', async () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Approve Milestone'));
    
    // In the modal
    const confirmBtn = screen.getByRole('button', { name: /Confirm Approve/i });
    fireEvent.click(confirmBtn);

    expect(mockApproveValidation).toHaveBeenCalledWith('v-101', '');
    expect(mockNavigate).toHaveBeenCalledWith('/verifier/queue');
  });

  it('executes rejectValidation with notes and navigates back', async () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    // Enter initial notes
    const initialNotesArea = screen.getByPlaceholderText(/Start adding your review notes here/i);
    fireEvent.change(initialNotesArea, { target: { value: 'Evidence is missing details.' } });

    fireEvent.click(screen.getByText('Reject Milestone'));
    
    // In the modal
    const modalNotesArea = screen.getByPlaceholderText(/Reason for rejection is required/i);
    expect(modalNotesArea).toHaveValue('Evidence is missing details.');

    const confirmBtn = screen.getByRole('button', { name: /Confirm Reject/i });
    fireEvent.click(confirmBtn);

    expect(mockRejectValidation).toHaveBeenCalledWith('v-101', 'Evidence is missing details.');
    expect(mockNavigate).toHaveBeenCalledWith('/verifier/queue');
  });

  it('autosaves verifier notes and restores them after remounting the task', () => {
    vi.useFakeTimers();
    const draftKey = getNotesDraftKey('v-101');
    const { unmount } = render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/Start adding your review notes here/i), {
      target: { value: 'Check the IPFS proof before approval.' },
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.localStorage.getItem(draftKey)).toBe('Check the IPFS proof before approval.');

    unmount();

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText(/Start adding your review notes here/i)).toHaveValue(
      'Check the IPFS proof before approval.'
    );
  });

  it('does not persist empty verifier notes', () => {
    vi.useFakeTimers();
    const draftKey = getNotesDraftKey('v-101');
    window.localStorage.setItem(draftKey, 'Previous note');

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/Start adding your review notes here/i), {
      target: { value: '   ' },
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.localStorage.getItem(draftKey)).toBeNull();
  });

  it('clears notes draft after approving and prevents stale debounced rewrites', () => {
    vi.useFakeTimers();
    const draftKey = getNotesDraftKey('v-101');
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/Start adding your review notes here/i), {
      target: { value: 'Approve once owner proof is checked.' },
    });
    fireEvent.click(screen.getByText('Approve Milestone'));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Approve/i }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockApproveValidation).toHaveBeenCalledWith('v-101', 'Approve once owner proof is checked.');
    expect(window.localStorage.getItem(draftKey)).toBeNull();
  });

  it('clears notes draft after rejecting', () => {
    vi.useFakeTimers();
    const draftKey = getNotesDraftKey('v-101');
    window.localStorage.setItem(draftKey, 'Reject this proof.');

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Reject Milestone'));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Reject/i }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockRejectValidation).toHaveBeenCalledWith('v-101', 'Reject this proof.');
    expect(window.localStorage.getItem(draftKey)).toBeNull();
  });

  it('disables confirm button for rejection if notes are empty', async () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Reject Milestone'));
    
    const confirmBtn = screen.getByRole('button', { name: /Confirm Reject/i });
    expect(confirmBtn).toBeDisabled();

    const modalNotesArea = screen.getByPlaceholderText(/Reason for rejection is required/i);
    fireEvent.change(modalNotesArea, { target: { value: 'Now it has notes' } });

    expect(confirmBtn).not.toBeDisabled();
  });

  it('restores a verifier notes draft for the current task', () => {
    window.localStorage.setItem(getNotesDraftKey('v-101'), 'Saved review notes');

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText(/Start adding your review notes here/i)).toHaveValue('Saved review notes');
  });

  it('debounces verifier notes draft writes', () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/Start adding your review notes here/i), {
      target: { value: 'Draft saved after debounce' },
    });

    expect(window.localStorage.getItem(getNotesDraftKey('v-101'))).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.localStorage.getItem(getNotesDraftKey('v-101'))).toBe('Draft saved after debounce');
  });

  it('clears a restored verifier notes draft after approval', () => {
    window.localStorage.setItem(getNotesDraftKey('v-101'), 'Ready to approve');

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Approve Milestone'));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Approve/i }));

    expect(mockApproveValidation).toHaveBeenCalledWith('v-101', 'Ready to approve');
    expect(window.localStorage.getItem(getNotesDraftKey('v-101'))).toBeNull();
  });

  it('renders "No evidence link provided" when task has no evidenceUrl', () => {
    mockStore({
      pendingValidations: [{ ...mockPendingValidations[0], evidenceUrl: undefined }],
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByText('No evidence link provided.')).toBeInTheDocument();
  });

  it('renders evidence preview card with GitHub badge for GitHub URLs', () => {
    mockStore({
      pendingValidations: [{ ...mockPendingValidations[0], evidenceUrl: 'https://github.com/user/repo' }],
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('github.com')).toBeInTheDocument();
  });

  it('renders evidence preview card with Figma badge for Figma URLs', () => {
    mockStore({
      pendingValidations: [{ ...mockPendingValidations[0], evidenceUrl: 'https://www.figma.com/file/abc123' }],
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByText('Figma')).toBeInTheDocument();
    expect(screen.getByText('figma.com')).toBeInTheDocument();
  });

  it('renders evidence preview card with IPFS badge for IPFS URLs', () => {
    mockStore({
      pendingValidations: [{ ...mockPendingValidations[0], evidenceUrl: 'https://ipfs.io/ipfs/QmXoyp' }],
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByText('IPFS')).toBeInTheDocument();
    expect(screen.getByText('ipfs.io')).toBeInTheDocument();
  });

  it('renders evidence preview card with Other badge for other URLs', () => {
    mockStore({
      pendingValidations: [{ ...mockPendingValidations[0], evidenceUrl: 'https://example.com' }],
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('still renders SafeLink even for invalid URLs', () => {
    mockStore({
      pendingValidations: [{ ...mockPendingValidations[0], evidenceUrl: 'not-a-valid-url' }],
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByText('[Invalid Link]')).toBeInTheDocument();
  });

  it('allows switching decision inside the modal', async () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Approve Milestone'));
    
    expect(screen.getByText(/Approval will trigger an on-chain transaction/)).toBeInTheDocument();

    // Target the Reject button specifically inside the modal
    const modal = screen.getByRole('dialog');
    const rejectBtn = within(modal).getByRole('button', { name: /Reject/i });
    fireEvent.click(rejectBtn);

    expect(screen.getByText(/Rejection will notify the vault owner/)).toBeInTheDocument();
  });

  it('does not have hardcoded color classes on the primary container', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );
    const primaryContainer = container.firstChild as HTMLElement;
    expect(primaryContainer.className).not.toContain('bg-white');
    expect(primaryContainer.className).not.toContain('text-gray-500');
    expect(primaryContainer.className).not.toContain('text-red-600');
  });

  // --- Criteria gate tests ---

  it('renders criteria checkboxes when task has criteria', () => {
    mockStore({
      pendingValidations: mockPendingWithCriteria,
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );


    expect(screen.getByLabelText('Criterion A')).toBeInTheDocument();
    expect(screen.getByLabelText('Criterion B')).toBeInTheDocument();
  });

  it('approve button is disabled when criteria are present but unchecked', () => {
    mockStore({
      pendingValidations: mockPendingWithCriteria,
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Approve Milestone/i })).toBeDisabled();
  });

  it('approve button remains disabled when only some criteria are checked', () => {
    mockStore({
      pendingValidations: mockPendingWithCriteria,
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText('Criterion A'));

    expect(screen.getByRole('button', { name: /Approve Milestone/i })).toBeDisabled();
  });

  it('approve button is enabled when all criteria are checked', () => {
    mockStore({
      pendingValidations: mockPendingWithCriteria,
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText('Criterion A'));
    fireEvent.click(screen.getByLabelText('Criterion B'));

    expect(screen.getByRole('button', { name: /Approve Milestone/i })).not.toBeDisabled();
  });

  it('reject button is always enabled regardless of criteria', () => {
    mockStore({
      pendingValidations: mockPendingWithCriteria,
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    // No criteria checked yet
    expect(screen.getByRole('button', { name: /Reject Milestone/i })).not.toBeDisabled();
  });

  it('unchecking a criterion re-disables the approve button', () => {
    mockStore({
      pendingValidations: mockPendingWithCriteria,
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText('Criterion A'));
    fireEvent.click(screen.getByLabelText('Criterion B'));
    expect(screen.getByRole('button', { name: /Approve Milestone/i })).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText('Criterion A'));
    expect(screen.getByRole('button', { name: /Approve Milestone/i })).toBeDisabled();
  });

  it('does not render criteria section when task has no criteria', () => {
    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    expect(screen.queryByText('Milestone Criteria')).not.toBeInTheDocument();
  });

  it('resets checked criteria when navigating to a different validation task', () => {
    const pendingWithTwoTasks = [
      ...mockPendingWithCriteria,
      {
        id: 'v-202',
        vaultName: 'Another Vault',
        owner: '0x456',
        amount: '200 USDC',
        deadline: '2026-07-01',
        status: 'pending' as const,
        milestone: 'Another Milestone',
        evidenceUrl: 'https://example.com/evidence2',
        criteria: ['Criterion X', 'Criterion Y'],
      },
    ];

    mockStore({
      pendingValidations: pendingWithTwoTasks,
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    mockVaultId = 'v-101';
    const { rerender } = render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    // Check all criteria for the first task
    fireEvent.click(screen.getByLabelText('Criterion A'));
    fireEvent.click(screen.getByLabelText('Criterion B'));
    expect(screen.getByRole('button', { name: /Approve Milestone/i })).not.toBeDisabled();

    // Navigate to a different task
    mockVaultId = 'v-202';
    rerender(
      <MemoryRouter initialEntries={['/verifier/v-202']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    // New task's criteria should be unchecked → approve disabled
    expect(screen.getByLabelText('Criterion X')).not.toBeChecked();
    expect(screen.getByLabelText('Criterion Y')).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Approve Milestone/i })).toBeDisabled();

    // Verify old criteria text is not present
    expect(screen.queryByLabelText('Criterion A')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Criterion B')).not.toBeInTheDocument();
  });

  it('retains checked state per criterion text when criteria are reordered', () => {
    const reorderedCriteria = ['Criterion B', 'Criterion A'];

    mockStore({
      pendingValidations: [{ ...mockPendingWithCriteria[0], criteria: reorderedCriteria }],
      approveValidation: mockApproveValidation,
      rejectValidation: mockRejectValidation,
    });

    render(
      <MemoryRouter initialEntries={['/verifier/v-101']}>
        <ValidationDetail />
      </MemoryRouter>
    );

    // Check 'Criterion A' — it's now at the second position (index 1)
    fireEvent.click(screen.getByLabelText('Criterion A'));

    // Only one checkbox should be checked, and it should be 'Criterion A'
    const checkboxA = screen.getByLabelText('Criterion A') as HTMLInputElement;
    const checkboxB = screen.getByLabelText('Criterion B') as HTMLInputElement;
    expect(checkboxA).toBeChecked();
    expect(checkboxB).not.toBeChecked();

    // The reorder hasn't caused incorrect state — checked stays with 'Criterion A'
    expect(screen.getByRole('button', { name: /Approve Milestone/i })).toBeDisabled();

    // Check both
    fireEvent.click(screen.getByLabelText('Criterion B'));
    expect(screen.getByRole('button', { name: /Approve Milestone/i })).not.toBeDisabled();
  });

  describe('Failure Path & Boundary Coverage', () => {
    it('handles undefined or null pendingValidations store state gracefully', () => {
      mockStore({
        pendingValidations: undefined,
        approveValidation: mockApproveValidation,
        rejectValidation: mockRejectValidation,
      });

      render(
        <MemoryRouter initialEntries={['/verifier/v-101']}>
          <ValidationDetail />
        </MemoryRouter>
      );

      expect(screen.getByText('Validation Not Found')).toBeInTheDocument();
    });

    it('handles whitespace-only or empty vaultId by showing Validation Not Found', () => {
      mockVaultId = '   ';
      render(
        <MemoryRouter initialEntries={['/verifier/   ']}>
          <ValidationDetail />
        </MemoryRouter>
      );

      expect(screen.getByText('Validation Not Found')).toBeInTheDocument();
    });

    it('handles invalid deadline date string without throwing NaN', () => {
      mockStore({
        pendingValidations: [{ ...mockPendingValidations[0], deadline: 'invalid-date' }],
        approveValidation: mockApproveValidation,
        rejectValidation: mockRejectValidation,
      });

      render(
        <MemoryRouter initialEntries={['/verifier/v-101']}>
          <ValidationDetail />
        </MemoryRouter>
      );

      expect(screen.getByText('Deadline: 0 days remaining')).toBeInTheDocument();
    });

    it('deduplicates duplicate criteria strings and enables approval when all unique criteria are checked', () => {
      mockStore({
        pendingValidations: [
          {
            ...mockPendingValidations[0],
            criteria: ['Criterion A', 'Criterion A', 'Criterion B', '   '],
          },
        ],
        approveValidation: mockApproveValidation,
        rejectValidation: mockRejectValidation,
      });

      render(
        <MemoryRouter initialEntries={['/verifier/v-101']}>
          <ValidationDetail />
        </MemoryRouter>
      );

      // Should render unique non-empty criteria
      const criterionACheckboxes = screen.getAllByLabelText('Criterion A');
      expect(criterionACheckboxes.length).toBe(1);

      expect(screen.getByRole('button', { name: /Approve Milestone/i })).toBeDisabled();

      fireEvent.click(screen.getByLabelText('Criterion A'));
      fireEvent.click(screen.getByLabelText('Criterion B'));

      expect(screen.getByRole('button', { name: /Approve Milestone/i })).not.toBeDisabled();
    });

    it('prevents approval when criteria gate is closed even if approval action is triggered', () => {
      mockStore({
        pendingValidations: mockPendingWithCriteria,
        approveValidation: mockApproveValidation,
        rejectValidation: mockRejectValidation,
      });

      render(
        <MemoryRouter initialEntries={['/verifier/v-101']}>
          <ValidationDetail />
        </MemoryRouter>
      );

      // Trigger reject modal to get modal open, then switch decision to approve
      fireEvent.click(screen.getByText('Reject Milestone'));
      const modal = screen.getByRole('dialog');
      const approveBtnInModal = within(modal).getByRole('button', { name: /Approve/i });
      fireEvent.click(approveBtnInModal);

      const confirmBtn = screen.getByRole('button', { name: /Confirm Approve/i });
      fireEvent.click(confirmBtn);

      expect(mockApproveValidation).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/milestone criteria gate is not open|all criteria must be completed/i);
    });

    it('displays error alert and recovers gracefully when approveValidation throws an error', async () => {
      const failingApprove = vi.fn().mockImplementation(() => {
        throw new Error('On-chain RPC connection failed');
      });

      mockStore({
        pendingValidations: mockPendingValidations,
        approveValidation: failingApprove,
        rejectValidation: mockRejectValidation,
      });

      render(
        <MemoryRouter initialEntries={['/verifier/v-101']}>
          <ValidationDetail />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Approve Milestone'));
      fireEvent.click(screen.getByRole('button', { name: /Confirm Approve/i }));

      expect(failingApprove).toHaveBeenCalledWith('v-101', '');
      expect(mockNavigate).not.toHaveBeenCalled();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('On-chain RPC connection failed');

      // Dismiss error
      fireEvent.click(screen.getByRole('button', { name: /Dismiss error/i }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('handles async rejection failure and retains notes draft for retry', async () => {
      let rejectPromiseReject: (reason?: unknown) => void;
      const failingAsyncReject = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          rejectPromiseReject = reject;
        });
      });

      mockStore({
        pendingValidations: mockPendingValidations,
        approveValidation: mockApproveValidation,
        rejectValidation: failingAsyncReject,
      });

      render(
        <MemoryRouter initialEntries={['/verifier/v-101']}>
          <ValidationDetail />
        </MemoryRouter>
      );

      const notesInput = screen.getByPlaceholderText(/Start adding your review notes here/i);
      fireEvent.change(notesInput, { target: { value: 'Incomplete proof details.' } });

      fireEvent.click(screen.getByText('Reject Milestone'));
      fireEvent.click(screen.getByRole('button', { name: /Confirm Reject/i }));

      await act(async () => {
        rejectPromiseReject!(new Error('Network request timed out'));
      });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Network request timed out');
      expect(notesInput).toHaveValue('Incomplete proof details.');
    });

    it('prevents concurrent double-submission during in-flight action', async () => {
      let resolveAction: (val: unknown) => void;
      const slowAction = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveAction = resolve;
        });
      });

      mockStore({
        pendingValidations: mockPendingValidations,
        approveValidation: slowAction,
        rejectValidation: mockRejectValidation,
      });

      render(
        <MemoryRouter initialEntries={['/verifier/v-101']}>
          <ValidationDetail />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Approve Milestone'));
      const confirmBtn = screen.getByRole('button', { name: /Confirm Approve/i });

      // Click once
      fireEvent.click(confirmBtn);
      // Click again while in-flight
      fireEvent.click(confirmBtn);

      expect(slowAction).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveAction!(true);
      });
    });
  });
});
