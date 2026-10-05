import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValidationTask } from '../../Zustand/Store';
import { useVerifierStore } from '../../Zustand/Store';
import ValidationHistory from '../ValidationHistory';
import { filterValidationHistory, paginate } from '../../utils/paginate';

/**
 * Authorization and validation regression coverage for `ValidationHistory`.
 *
 * The existing suite (`ValidationHistory.test.tsx`) covers the happy paths:
 * status/search/date/milestone filtering, pagination controls, page-size
 * persistence, and CSV export. What it does not reach is the validation
 * surface — what happens when the store hands the page data that does not
 * match the `ValidationTask` shape.
 *
 * `ValidationTask` types `vaultName`, `owner`, and `milestone` as required
 * strings, but the store is hydrated from persisted and remote data, so the
 * type system does not protect the runtime path. That is the gap closed
 * here.
 */

const { mockDownloadCsv } = vi.hoisted(() => ({ mockDownloadCsv: vi.fn() }));

vi.mock('../../utils/csv', async () => {
  const actual = await vi.importActual('../../utils/csv');
  return { ...actual, downloadCsv: mockDownloadCsv };
});

vi.mock('../../Zustand/Store', () => ({ useVerifierStore: vi.fn() }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function Probe() {
  return <ValidationHistory />;
}

/** The stat banner renders `<p>Label</p>` then `<h2>value</h2>`; several
 *  labels ("Approved") also appear as filter chips, so scope to the caption. */
function statValue(label: string): string {
  const nodes = screen.getAllByText(label);
  const caption = nodes.find((n) => n.tagName === 'P') ?? nodes[0];
  return (caption.nextElementSibling as HTMLElement)?.textContent ?? '';
}

const NO_MATCH = 'No matching validations';

function setHistory(tasks: unknown[]) {
  vi.mocked(useVerifierStore).mockImplementation(
    ((selector: (s: { validationHistory: unknown[] }) => unknown) =>
      selector({ validationHistory: tasks })) as never,
  );
}

/** A well-formed task; spread and override to produce malformed variants. */
const good: ValidationTask = {
  id: 'v-001',
  vaultName: 'Alpha Vault',
  owner: 'GOWNERALPHA',
  amount: '1,000 USDC',
  deadline: '2026-01-01',
  status: 'approved',
  milestone: 'Launch',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('filterValidationHistory tolerates malformed store data', () => {
  it('does not throw when a task is missing milestone', () => {
    const tasks = [{ ...good, milestone: undefined } as unknown as ValidationTask];
    expect(() =>
      filterValidationHistory(tasks, { status: 'all', query: '', milestone: 'lau' }),
    ).not.toThrow();
  });

  it('does not throw when a task is missing vaultName or owner', () => {
    const tasks = [
      { ...good, vaultName: undefined } as unknown as ValidationTask,
      { ...good, owner: undefined } as unknown as ValidationTask,
    ];
    expect(() =>
      filterValidationHistory(tasks, { status: 'all', query: 'alpha' }),
    ).not.toThrow();
  });

  it('treats missing text fields as empty rather than matching them', () => {
    // Distinct owner/vault values so each assertion isolates one field.
    const tasks = [
      { ...good, id: 'no-name', vaultName: undefined, owner: 'GOWNERX' } as unknown as ValidationTask,
      { ...good, id: 'no-milestone', milestone: undefined } as unknown as ValidationTask,
      {
        ...good,
        id: 'no-text',
        vaultName: undefined,
        owner: undefined,
        milestone: undefined,
      } as unknown as ValidationTask,
    ];

    // A name search can only match a field that exists: the task with no
    // vaultName drops out unless its owner matches.
    expect(
      filterValidationHistory(tasks, { status: 'all', query: 'alpha' }).map((t) => t.id),
    ).toEqual(['no-milestone']);
    // Its owner still matches, so the row is not lost wholesale.
    expect(
      filterValidationHistory(tasks, { status: 'all', query: 'ownerx' }).map((t) => t.id),
    ).toEqual(['no-name']);
    // A milestone filter can only match a milestone that exists, so the task
    // whose milestone is absent drops out while the one that kept it matches.
    expect(
      filterValidationHistory(tasks, { status: 'all', query: '', milestone: 'lau' }).map(
        (t) => t.id,
      ),
    ).toEqual(['no-name']);
    // With no searchable text at all, a query cannot match the row.
    expect(
      filterValidationHistory(tasks, { status: 'all', query: 'alpha', milestone: 'lau' }).map(
        (t) => t.id,
      ),
    ).toEqual([]);
  });

  it('still filters correctly when well-formed and malformed tasks are mixed', () => {
    const tasks = [
      good,
      { ...good, id: 'broken', vaultName: undefined, milestone: undefined } as unknown as ValidationTask,
    ];

    expect(
      filterValidationHistory(tasks, { status: 'all', query: '', milestone: 'launch' }).map(
        (t) => t.id,
      ),
    ).toEqual(['v-001']);
  });
});

describe('ValidationHistory approval-rate validation', () => {
  it('renders 0% rather than NaN when there is no history at all', () => {
    setHistory([]);
    render(<Probe />);

    expect(statValue('Total Validated')).toBe('0');
    expect(statValue('Approval Rate')).toBe('0%');
    expect(document.body.textContent).not.toContain('NaN');
  });

  it.each([
    ['1 approved of 1', [{ ...good, status: 'approved' }], '100%'],
    ['0 approved of 1', [{ ...good, status: 'rejected' }], '0%'],
    ['2 of 3', [good, { ...good, id: 'b', status: 'approved' }, { ...good, id: 'c', status: 'rejected' }], '67%'],
    ['1 of 3', [good, { ...good, id: 'b', status: 'rejected' }, { ...good, id: 'c', status: 'rejected' }], '33%'],
  ])('computes the approval rate for %s', (_label, tasks, expected) => {
    setHistory(tasks);
    render(<Probe />);
    expect(statValue('Approval Rate')).toBe(expected);
  });

  it('does not count an unrecognised status in either bucket but keeps it in the total', () => {
    setHistory([
      { ...good, status: 'approved' },
      { ...good, id: 'weird', status: 'archived' } as unknown as ValidationTask,
    ]);
    render(<Probe />);

    expect(statValue('Total Validated')).toBe('2');
    expect(statValue('Approved')).toBe('1');
    expect(statValue('Rejected')).toBe('0');
    // 1 approved out of 2 total, so the unknown status still dilutes the rate.
    expect(statValue('Approval Rate')).toBe('50%');
  });
});

describe('ValidationHistory date-range validation', () => {
  it('an inverted range (from after to) yields no matches instead of everything', () => {
    setHistory([good]);
    render(<Probe />);

    const from = screen.getByLabelText('Filter validation history from date');
    const to = screen.getByLabelText('Filter validation history to date');

    fireEvent.change(from, { target: { value: '2026-06-01' } });
    fireEvent.change(to, { target: { value: '2026-01-01' } });

    expect(screen.getByText(NO_MATCH)).toBeInTheDocument();
    expect(screen.queryByText('Alpha Vault')).not.toBeInTheDocument();
  });

  it('renders without crashing when a task has an unparseable deadline', () => {
    setHistory([{ ...good, deadline: 'not-a-date' }]);
    expect(() => render(<Probe />)).not.toThrow();

    // Known limitation, pinned deliberately: date bounds are compared as
    // strings, so a non-ISO deadline sorts after every ISO date ('n' > '2')
    // and therefore satisfies a `from` bound. This asserts the real
    // behaviour so that changing it to a real date comparison is a visible,
    // intentional change rather than an accident.
    fireEvent.change(screen.getByLabelText('Filter validation history from date'), {
      target: { value: '2026-01-01' },
    });
    expect(screen.getByText('Alpha Vault')).toBeInTheDocument();

    // A `to` bound rejects it, which is the asymmetric half of the same
    // lexical comparison.
    fireEvent.change(screen.getByLabelText('Filter validation history from date'), {
      target: { value: '',
    } });
    fireEvent.change(screen.getByLabelText('Filter validation history to date'), {
      target: { value: '2026-01-01' },
    });
    expect(screen.getByText(NO_MATCH)).toBeInTheDocument();
  });
});

describe('ValidationHistory pagination invariants', () => {
  it('clamps to the last page when a filter shrinks the result set', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({
      ...good,
      id: `v-${i}`,
      vaultName: `Vault ${i}`,
      deadline: `2026-01-0${i + 1}`,
      status: i % 2 === 0 ? ('approved' as const) : ('rejected' as const),
    }));

    // Direct assertion of the clamp the page depends on.
    const all = paginate(tasks, 3, 2);
    expect(all.currentPage).toBe(3);

    const filtered = paginate(tasks.slice(0, 2), 3, 2);
    expect(filtered.currentPage).toBe(1);
    expect(filtered.pageCount).toBe(1);
    expect(filtered.items).toHaveLength(2);

    setHistory(tasks);
    render(<Probe />);

    // Page forward, then narrow with a filter that leaves too few rows.
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.change(screen.getByLabelText('Search validation history by vault or owner'), {
      target: { value: 'Vault 1' },
    });

    // Must not strand the user on an empty page.
    expect(screen.queryByText(NO_MATCH)).not.toBeInTheDocument();
  });

  it('treats a zero or negative page size as 1 rather than looping or throwing', () => {
    expect(paginate([good], 1, 0).pageSize).toBe(1);
    expect(paginate([good], 1, -5).pageSize).toBe(1);
    expect(paginate([], 1, 10).pageCount).toBe(1);
    expect(paginate([], 99, 10).items).toEqual([]);
  });
});

describe('ValidationHistory authorization surface', () => {
  it('exposes no approve/reject mutation controls — the log is read-only', () => {
    setHistory([good, { ...good, id: 'v-002', status: 'rejected' }]);
    render(<Probe />);

    // A history view must not offer state-changing actions that the
    // verifier flow owns. Any such control appearing here is a privilege
    // regression.
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();

    // The only navigation the page owns is back to the verifier dashboard.
    const back = screen.getByRole('button', { name: /back to dashboard/i });
    fireEvent.click(back);
    expect(mockNavigate).toHaveBeenCalledWith('/verifier');
  });

  it('does not leak task notes for a record while a filter is active', () => {
    setHistory([
      { ...good, notes: 'SECRET-APPROVAL-NOTE' },
      { ...good, id: 'v-002', vaultName: 'Beta', notes: 'OTHER-NOTE' },
    ]);
    render(<Probe />);

    fireEvent.change(screen.getByLabelText('Search validation history by vault or owner'), {
      target: { value: 'Beta' },
    });

    expect(screen.queryByText(/SECRET-APPROVAL-NOTE/)).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
