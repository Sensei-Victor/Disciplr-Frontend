import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Text } from '../components/Text';
import { useVerifierStore } from '../Zustand/Store';
import {
  filterValidationHistory,
  paginate,
} from '../utils/paginate';
import type { ValidationHistoryStatusFilter } from '../utils/paginate';
import { downloadCsv, toCsv } from '../utils/csv';
import { StatusChip } from '../components/StatusChip';
import { mapValidationStatusToChipStatus } from '../utils/verifierStatus';
import {
  VALIDATION_HISTORY_PAGE_SIZE_OPTIONS,
  persistValidationHistoryPageSize,
  readValidationHistoryPageSize,
} from '../utils/pageSizePref';

export default function ValidationHistory() {
  const navigate = useNavigate();
  const validationHistory = useVerifierStore((state) => state.validationHistory);
  const [statusFilter, setStatusFilter] = useState<ValidationHistoryStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [milestoneFilter, setMilestoneFilter] = useState('');
  const [pageSize, setPageSize] = useState(() => readValidationHistoryPageSize());
  const [page, setPage] = useState(1);

  // Calculate the Approve/Reject Ratio
  const total = validationHistory.length;
  const approvedCount = validationHistory.filter((t) => t.status === 'approved').length;
  const rejectedCount = validationHistory.filter((t) => t.status === 'rejected').length;
  const approvalRate = total > 0 ? Math.round((approvedCount / total) * 100) : 0;
  const filteredHistory = useMemo(
    () => filterValidationHistory(validationHistory, { status: statusFilter, query: searchQuery, from: fromDate || undefined, to: toDate || undefined, milestone: milestoneFilter || undefined }),
    [validationHistory, statusFilter, searchQuery, fromDate, toDate, milestoneFilter],
  );
  const pagination = useMemo(
    () => paginate(filteredHistory, page, pageSize),
    [filteredHistory, page, pageSize]
  );

  const updateStatusFilter = (status: ValidationHistoryStatusFilter) => {
    setStatusFilter(status);
    setPage(1);
  };

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const updateFromDate = (value: string) => { setFromDate(value); setPage(1); };
  const updateToDate = (value: string) => { setToDate(value); setPage(1); };
  const updateMilestoneFilter = (value: string) => { setMilestoneFilter(value); setPage(1); };

  const updatePageSize = (size: number) => {
    const nextSize = persistValidationHistoryPageSize(size);
    setPageSize(nextSize);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="mb-2">
        <button 
          onClick={() => navigate('/verifier')}
          className="mb-2 text-sm font-medium transition"
          style={{ color: 'var(--muted)' }}
        >
          &larr; Back to Dashboard
        </button>
        <Text role="display" as="h1">Validation History</Text>
        <Text role="body" as="p" className="mt-1" style={{ color: 'var(--muted)' }}>
          A complete log of your past milestone verifications and notes.
        </Text>
      </header>

      {/* Stats / Ratio Banner */}
      <section
        className="flex flex-col md:flex-row gap-4 p-6 border rounded-lg shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex-1">
          <Text role="body" as="p" style={{ color: 'var(--muted)' }}>Total Validated</Text>
          <Text role="display" as="h2">{total}</Text>
        </div>
        <div className="flex-1">
          <Text role="body" as="p" style={{ color: 'var(--muted)' }}>Approved</Text>
          <Text role="display" as="h2" style={{ color: 'var(--success)' }}>{approvedCount}</Text>
        </div>
        <div className="flex-1">
          <Text role="body" as="p" style={{ color: 'var(--muted)' }}>Rejected</Text>
          <Text role="display" as="h2" style={{ color: 'var(--danger)' }}>{rejectedCount}</Text>
        </div>
        <div className="flex-1">
          <Text role="body" as="p" style={{ color: 'var(--muted)' }}>Approval Rate</Text>
          <Text role="display" as="h2">{approvalRate}%</Text>
        </div>
      </section>

      <section
        className="flex flex-col md:flex-row gap-4 p-4 border rounded-lg"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        aria-label="Validation history filters"
      >
        <label className="flex flex-col gap-1 flex-1">
          <Text role="caption" as="span" style={{ color: 'var(--muted)' }}>Search vault or owner</Text>
          <input
            aria-label="Search validation history by vault or owner"
            value={searchQuery}
            onChange={(event) => updateSearchQuery(event.target.value)}
            placeholder="Search vault or owner"
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.65rem 0.75rem',
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <Text role="caption" as="span" style={{ color: 'var(--muted)' }}>From</Text>
          <input
            type="date"
            aria-label="Filter validation history from date"
            value={fromDate}
            onChange={(event) => updateFromDate(event.target.value)}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.65rem 0.75rem',
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <Text role="caption" as="span" style={{ color: 'var(--muted)' }}>To</Text>
          <input
            type="date"
            aria-label="Filter validation history to date"
            value={toDate}
            onChange={(event) => updateToDate(event.target.value)}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.65rem 0.75rem',
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <Text role="caption" as="span" style={{ color: 'var(--muted)' }}>Milestone</Text>
          <input
            aria-label="Filter validation history by milestone"
            value={milestoneFilter}
            onChange={(event) => updateMilestoneFilter(event.target.value)}
            placeholder="Milestone"
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.65rem 0.75rem',
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <Text role="caption" as="span" style={{ color: 'var(--muted)' }}>Outcome</Text>
          <select
            aria-label="Filter validation history by outcome"
            value={statusFilter}
            onChange={(event) => updateStatusFilter(event.target.value as ValidationHistoryStatusFilter)}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.65rem 0.75rem',
            }}
          >
            <option value="all">All outcomes</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <Text role="caption" as="span" style={{ color: 'var(--muted)' }}>Page size</Text>
          <select
            aria-label="Validation history page size"
            value={pageSize}
            onChange={(event) => updatePageSize(Number(event.target.value))}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.65rem 0.75rem',
            }}
          >
            {VALIDATION_HISTORY_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size} per page</option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 self-end">
          <Text role="caption" as="span" style={{ color: 'var(--muted)' }}>&nbsp;</Text>
          <button
            aria-label="Export filtered validation history as CSV"
            onClick={() => downloadCsv(toCsv(filteredHistory), 'validation-history.csv')}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.65rem 0.75rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Export CSV
          </button>
        </div>
      </section>

      {/* History Log */}
      <section
        className="border rounded-lg shadow-sm overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {total === 0 ? (
          <div className="p-12 text-center" style={{ color: 'var(--muted)' }}>
            <Text role="body" as="h3">No History Found</Text>
            <Text role="body" as="p" className="mt-2">You haven't processed any validations yet.</Text>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="p-12 text-center" style={{ color: 'var(--muted)' }}>
            <Text role="body" as="h3">No matching validations</Text>
            <Text role="body" as="p" className="mt-2">
              Adjust the outcome filter or search query to see more results.
            </Text>
          </div>
        ) : (
          <div className="flex flex-col">
            {pagination.items.map((task) => (
              <div 
                key={task.id} 
                className="p-6 border-b last:border-b-0 transition flex flex-col md:flex-row gap-4 justify-between"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex flex-col gap-2 md:w-1/3">
                  <div className="flex items-center gap-3">
                    <StatusChip
                      status={mapValidationStatusToChipStatus(task.status)}
                      className="uppercase"
                      size="sm"
                    />
                    <Text role="body" as="span" className="text-sm" style={{ color: 'var(--muted)' }}>
                      ID: {task.id}
                    </Text>
                  </div>
                  <Text role="body" as="h3">{task.vaultName}</Text>
                  <Text role="body" as="p" className="text-sm font-medium">{task.milestone}</Text>
                  <span
                    className="text-xs px-2 py-1 rounded font-mono w-max"
                    style={{
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Owner: {task.owner}
                  </span>
                </div>

                <div
                  className="md:w-2/3 p-4 rounded border text-sm"
                  style={{
                    background: 'var(--bg)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  <Text role="body" as="p" className="font-bold mb-1 text-xs uppercase" style={{ color: 'var(--muted)' }}>
                    Verification Notes:
                  </Text>
                  <Text role="body" as="p" className="italic">
                    "{task.notes || 'No notes provided during verification.'}"
                  </Text>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {total > 0 && filteredHistory.length > 0 && (
        <nav
          className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between"
          aria-label="Validation history pagination"
        >
          <Text role="caption" as="p" style={{ color: 'var(--muted)' }}>
            Showing {pagination.items.length} of {pagination.totalItems} matching validations.
          </Text>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Go to previous validation history page"
              disabled={pagination.currentPage === 1}
              onClick={() => setPage((current) => current - 1)}
              className="px-3 py-2 rounded text-sm font-medium"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text)',
                background: 'var(--surface)',
                opacity: pagination.currentPage === 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <Text role="caption" as="span" aria-live="polite">
              Page {pagination.currentPage} of {pagination.pageCount}
            </Text>
            <button
              type="button"
              aria-label="Go to next validation history page"
              disabled={pagination.currentPage === pagination.pageCount}
              onClick={() => setPage((current) => current + 1)}
              className="px-3 py-2 rounded text-sm font-medium"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text)',
                background: 'var(--surface)',
                opacity: pagination.currentPage === pagination.pageCount ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
