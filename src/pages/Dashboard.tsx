import { Link } from "react-router-dom";
import { Text } from "../components/Text";
import VaultCard from "../components/VaultCard";
import UpcomingDeadlines from "../components/UpcomingDeadlines";
import { getAtRiskVaults } from "../utils/atRiskVaults";

// ── Types ─────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState, useEffect } from "react";
import * as dashboardUtils from "../utils/dashboard";
import type { VaultPreview, Activity, Deadline } from "../utils/dashboard";
import type { Milestone, Vault } from "../types/vault";
import { timelineProgress } from "../utils/vaultLifecycle";
import { validateVaultPreview, sanitizeActivity } from "../utils/dashboardValidation";

// ── Mock Data ─────────────────────────────────────────────────────────────────
// Seed data lives in src/fixtures/dashboard.ts. VAULTS are loaded async from
// vaultService (see Dashboard component below).
import { ACTIVITY, DEADLINES, CHART_DATA } from "../fixtures/dashboard";
import { listVaults } from "../services/vaultService";

// ── Helpers ───────────────────────────────────────────────────────────────────


/**
 * Invariant: only vaults whose preview passes validation are rendered.
 * Invalid entries are dropped and logged (no sensitive fields) so that
 * malformed upstream data cannot produce inconsistent summaries or cards.
 */
function toSafePreviews(loaded: Vault[]): VaultPreview[] {
  const safe: VaultPreview[] = [];
  for (const v of loaded) {
    const preview: VaultPreview = {
      id: v.id,
      name: v.name,
      amount: v.amount,
      currency: v.currency,
      status: v.status as VaultStatus,
      deadline: v.deadline,
      progressPct: timelineProgress(v.createdAt, v.deadline),
    };
    const result = validateVaultPreview(preview);
    if (result.ok) {
      safe.push(preview);
    } else {
      // eslint-disable-next-line no-console
      console.warn("[Dashboard] dropped invalid vault preview", {
        id: v.id,
        reason: result.reason,
      });
    }
  }
  return safe;
}

const ACTIVITY_CFG: Record<
  Activity["type"],
  { label: string; icon: string; color: string }
> = {
  created: { label: "Vault created", icon: "＋", color: "var(--accent)" },
  validated: {
    label: "Milestone validated",
    icon: "✓",
    color: "var(--success)",
  },
  released: {
    label: "Funds released",
    icon: "↑",
    color: "var(--info)",
  },
  redirected: { label: "Funds redirected", icon: "→", color: "var(--warning)" },
};

type ActivityConfig = (typeof ACTIVITY_CFG)[Activity["type"]];

/**
 * `activity` is a caller-supplied prop, so a type outside the union (a
 * forward-compatible backend value, or a JS caller passing junk) must not
 * dereference `undefined` and blank the page. Unrecognised types render with a
 * neutral fallback instead.
 */
const ACTIVITY_FALLBACK_CFG: ActivityConfig = {
  label: "Vault activity",
  icon: "•",
  color: "var(--muted)",
};

/**
 * Own-property lookup so a hostile type such as "__proto__" resolves to the
 * fallback rather than to `Object.prototype` (mirrors lookupVaultSafe).
 */
function activityConfig(type: string): ActivityConfig {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_CFG, type)
    ? ACTIVITY_CFG[type as Activity["type"]]
    : ACTIVITY_FALLBACK_CFG;
}

// Pure formatting functions have been extracted to src/utils/dashboard.ts and src/utils/vaultLifecycle.ts

// ── Service response boundary ────────────────────────────────────────────────
// `listVaults()` is typed as Promise<Vault[]>, but the seam is explicitly a
// placeholder for a real Horizon/Soroban backend (see vaultService.ts). Until
// that backend lands, every field it returns is untrusted input that crosses
// into render and into the summary arithmetic. The helpers below are the single
// place where that happens, so the rest of the page can assume its invariants.

/**
 * Stable, aggregatable failure codes. These are the only values recorded for a
 * load failure: no vault names, ids, addresses, amounts, or raw error messages
 * cross this boundary, so a failure stays diagnosable without leaking user
 * data into logs or metrics.
 */
type VaultLoadFailureCode = "unavailable" | "invalid_response";

/**
 * A vault that cleared the boundary. `milestones` is narrowed to a real array
 * of objects because `computeDashboardSummary` dereferences
 * `milestone.status` while counting pending milestones.
 */
type AcceptedVault = Vault & { milestones: Milestone[] };

/** Stable empty identities so render-time gating never invalidates memos. */
const NO_VAULTS: VaultPreview[] = [];
const NO_ACCEPTED_VAULTS: AcceptedVault[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface VaultListRead {
  /** Vaults that cleared the boundary, in response order, ids unique. */
  accepted: AcceptedVault[];
  /** Entries refused: malformed, hostile, or a repeated id. */
  rejected: number;
  /**
   * True when the payload yielded nothing renderable even though it claimed to
   * carry vaults. The page must show a retryable error here rather than the
   * "No vaults yet" empty state, which would assert a falsehood.
   */
  unusable: boolean;
}

/**
 * Validates one service entry against exactly the fields this page consumes:
 * id, name, status, amount, currency, createdAt, deadline and milestones.
 * Fields the dashboard never renders (addresses, transactions, milestone
 * details) are deliberately not gated — refusing to show a summary because an
 * unrendered address is oddly shaped would drop real vaults for no user benefit.
 *
 * Returns null for anything that must not reach render.
 */
function readVaultEntry(entry: unknown): AcceptedVault | null {
  if (!isRecord(entry)) return null;

  const { id, name, status, amount, currency, createdAt, deadline, milestones } =
    entry;

  // The id becomes a React key and a `/vaults/:id` URL segment, so it must be a
  // safe, bounded, non-prototype string.
  if (!isValidVaultRouteId(id)) return null;
  if (!isNonEmptyString(name)) return null;
  if (!isVaultStatus(status)) return null;
  // A non-finite amount would render as "NaN" and poison totalLocked.
  if (!isPositiveAmount(amount)) return null;
  if (!isValidCurrency(currency)) return null;
  if (!isValidIsoTimestamp(createdAt)) return null;
  if (!isValidIsoTimestamp(deadline)) return null;
  if (!Array.isArray(milestones)) return null;

  // A deadline at or before creation is an impossible vault; timelineProgress
  // would report it as 0% or 100% without ever saying why.
  if (new Date(deadline).getTime() <= new Date(createdAt).getTime()) {
    return null;
  }

  return {
    ...(entry as unknown as Vault),
    // Milestone elements are untrusted too: drop holes rather than let the
    // summary's `milestone.status` read dereference null.
    milestones: milestones.filter(isRecord) as unknown as Milestone[],
  };
}

/**
 * Applies the boundary to a whole service payload.
 *
 * Invariants:
 * - A non-array payload is unusable, never an empty vault list.
 * - Ids are unique: a repeated id is refused, so React keys stay unique and a
 *   duplicated record cannot be counted twice in the summary.
 * - Refusing one entry never discards its siblings (partial failure tolerance).
 *
 * Exported so the boundary can be exercised directly by property-based tests;
 * the page itself treats it as private.
 */
export function readVaultList(payload: unknown): VaultListRead {
  if (!Array.isArray(payload)) {
    return { accepted: [], rejected: 0, unusable: true };
  }

  const accepted: AcceptedVault[] = [];
  const seenIds = new Set<string>();
  let rejected = 0;

  for (const entry of payload) {
    const vault = readVaultEntry(entry);
    if (vault === null || seenIds.has(vault.id)) {
      rejected++;
      continue;
    }
    seenIds.add(vault.id);
    accepted.push(vault);
  }

  return {
    accepted,
    rejected,
    unusable: payload.length > 0 && accepted.length === 0,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <Text
        role="caption"
        as="div"
        style={{
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </Text>
      <Text
        role="title"
        as="div"
        style={{
          color: accent ? "var(--accent)" : "var(--text)",
          fontWeight: 700,
        }}
      >
        {value}
      </Text>
      {sub && (
        <Text role="caption" as="div" style={{ color: "var(--muted)" }}>
          {sub}
        </Text>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  action,
  to,
}: {
  title: string;
  action?: string;
  to?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "0.75rem",
      }}
    >
      <Text role="body" as="h2" style={{ margin: 0, fontWeight: 600 }}>
        {title}
      </Text>
      {action && to && (
        <Link to={to} style={{ color: "var(--accent)", fontSize: 13 }}>
          {action}
        </Link>
      )}
    </div>
  );
}

// ── At Risk Section ───────────────────────────────────────────────────────────
function AtRiskSection({ vaults }: { vaults: VaultPreview[] }) {
  const atRiskVaults = getAtRiskVaults(vaults);

  if (atRiskVaults.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: "1.75rem",
        background: "var(--danger-transparent)",
        border: "1px solid var(--danger)",
        borderRadius: "var(--radius)",
        padding: "1.25rem",
      }}
    >
      <SectionHeader title={`⚠️ At Risk (${atRiskVaults.length})`} />
      <Text
        role="caption"
        as="p"
        style={{ color: "var(--danger)", margin: "0 0 1rem" }}
      >
        These vaults need immediate attention — their deadlines are approaching
        or critical.
      </Text>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {atRiskVaults.map((v) => (
          <VaultCard
            key={v.id}
            id={v.id}
            name={v.name}
            amount={v.amount}
            currency={v.currency}
            status={v.status}
            deadline={v.deadline}
            progressPct={v.progressPct}
          />
        ))}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({
  activity = ACTIVITY,
  deadlines = DEADLINES,
}: {
  activity?: Activity[];
  deadlines?: Deadline[];
} = {}) {
  const [vaults, setVaults] = useState<VaultPreview[]>([]);
  const [fullVaults, setFullVaults] = useState<AcceptedVault[]>([]);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [vaultStatus, setVaultStatus] = useState<
    "loading" | "empty" | "data" | "error"
  >("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [requestId, setRequestId] = useState(0);

  // One load per component instance, single-flight. Concurrent callers receive
  // the in-flight request instead of starting a second one, so a React
  // StrictMode double-mount (src/main.tsx renders <StrictMode>) or an
  // overlapping retry can never issue two list requests for one page load, and
  // cannot apply two responses out of order. The runner is created lazily per
  // instance so separate Dashboard mounts never share in-flight state.
  const [vaultLoadRunner] = useState(() =>
    createSingleFlightRunner(listVaults),
  );

  // Load vaults asynchronously and ignore results after the component unmounts.
  useEffect(() => {
    let cancelled = false;
    const currentRequest = requestId;
    setVaultStatus("loading");
    setRejectedCount(0);

    const failWith = (code: VaultLoadFailureCode, received: number) => {
      logger.error("[dashboard] vault_load_failed", {
        code,
        attempt: retryCount + 1,
        received,
      });
      // Drop any previously loaded data: an error must not leave stale totals
      // on screen next to the failure notice.
      setFullVaults([]);
      setVaults([]);
      setRejectedCount(0);
      setVaultStatus("error");
    };

    vaultLoadRunner
      .run()
      .then((loaded) => {
        if (cancelled || currentRequest !== requestId) return;
        const safePreviews = toSafePreviews(loaded);
        setFullVaults(loaded);
        setVaults(safePreviews);
        setVaultStatus(safePreviews.length === 0 ? "empty" : "data");
      })
      .catch(() => {
        if (!cancelled && currentRequest === requestId) setVaultStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [retryCount, requestId]);

  const retryVaults = useCallback(() => {
    setRetryCount((c) => c + 1);
    setRequestId((r) => r + 1);
  }, []);

  // INVARIANT: vault-derived state is surfaced only in the "data" state. Gating
  // at render time (rather than relying on every failure path remembering to
  // clear) means the summary cards can never contradict the vault list — e.g.
  // stale totals above a "Failed to load vaults" message after a failed retry.
  const shownVaults = vaultStatus === "data" ? vaults : NO_VAULTS;
  const shownFullVaults = vaultStatus === "data" ? fullVaults : NO_ACCEPTED_VAULTS;

  const computedSummary = useMemo(
    () => dashboardUtils.computeDashboardSummary(shownFullVaults),
    [shownFullVaults],
  );
  const memoizedSummary = useMemo(
    () => dashboardUtils.formatSummary(computedSummary),
    [computedSummary],
  );
  // `activity` / `deadlines` are caller-supplied; a non-array must degrade to
  // "nothing to show" rather than throw while spreading it.
  const memoizedActivity = useMemo(
    () => dashboardUtils.processActivity(sanitizeActivity(activity)),
    [activity],
  );
  const safeDeadlines = Array.isArray(deadlines) ? deadlines : [];

  return (
    <div
      style={{
        maxWidth: "var(--container-wide)",
        margin: "0 auto",
        padding: "0 0 3rem",
      }}
    >
      {/* Welcome */}
      <div style={{ marginBottom: "1.75rem" }}>
        <Text role="title" as="h1" style={{ margin: "0 0 0.25rem" }}>
          Dashboard
        </Text>
        <Text role="body" as="p" style={{ color: "var(--muted)", margin: 0 }}>
          Your vault overview at a glance.
        </Text>
      </div>

      {/* ── Summary Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        <SummaryCard
          label="Total Locked"
          value={memoizedSummary.totalLocked}
          sub="USDC"
          accent
        />
        <SummaryCard
          label="Active Vaults"
          value={memoizedSummary.activeVaults}
        />
        <SummaryCard
          label="Pending Milestones"
          value={memoizedSummary.pendingMilestones}
        />
        <SummaryCard
          label="Completion Rate"
          value={memoizedSummary.completionRate}
          sub="all time"
        />
      </div>

      {/* ── Quick Actions ── */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1.75rem",
        }}
      >
        <Link
          to="/vaults/create"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            padding: "0.6rem 1.25rem",
            borderRadius: "var(--radius)",
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          + Create Vault
        </Link>
        <Link
          to="/vaults"
          style={{
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            padding: "0.6rem 1.25rem",
            borderRadius: "var(--radius)",
            fontWeight: 500,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          View All Vaults
        </Link>
        <Link
          to="/verifier/queue"
          style={{
            background: "var(--surface)",
            color: "var(--warning)",
            border: "1px solid var(--warning)",
            padding: "0.6rem 1.25rem",
            borderRadius: "var(--radius)",
            fontWeight: 500,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Verify Milestone
        </Link>
      </div>

      {/* ── At Risk Vaults ── */}
      <AtRiskSection vaults={shownVaults} />

      {/* ── Main grid: vault list + sidebar ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        {/* Left column */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          {/* Vault Preview List */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.25rem",
            }}
          >
            <SectionHeader
              title="Active Vaults"
              action="View all →"
              to="/vaults"
            />
            {vaultStatus === "loading" && (
              <Text role="body" as="p" style={{ color: "var(--muted)" }}>
                <span role="status">Loading vaults…</span>
              </Text>
            )}

            {vaultStatus === "error" && (
              <div
                role="alert"
                style={{
                  textAlign: "center",
                  padding: "2.5rem 1rem",
                  color: "var(--muted)",
                }}
              >
                <Text role="body" as="p">
                  Failed to load vaults.
                </Text>
                <button type="button" onClick={retryVaults}>
                  Retry
                </button>
              </div>
            )}

            {vaultStatus === "empty" && (
              <div
                style={{
                  textAlign: "center",
                  padding: "2.5rem 1rem",
                  color: "var(--muted)",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: "0.75rem" }}>🔒</div>
                <Text
                  role="body"
                  as="div"
                  style={{ fontWeight: 600, marginBottom: 4 }}
                >
                  No vaults yet
                </Text>
                <Text role="caption" as="div" style={{ marginBottom: "1rem" }}>
                  Create your first vault to start locking capital.
                </Text>
                <Link
                  to="/vaults/create"
                  style={{
                    background: "var(--accent)",
                    color: "var(--bg)",
                    padding: "0.5rem 1.25rem",
                    borderRadius: "var(--radius)",
                    fontWeight: 600,
                    fontSize: 13,
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  Create Vault
                </Link>
              </div>
            )}

            {vaultStatus === "data" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {/* Partial failure is never silent: a refused entry is neither
                    rendered nor counted in the summary, so the user is told how
                    many records the response could not be trusted for. */}
                {rejectedCount > 0 && (
                  <Text
                    role="caption"
                    as="p"
                    style={{ color: "var(--warning)", margin: 0 }}
                  >
                    <span role="status">
                      {rejectedCount === 1
                        ? "1 vault could not be verified and is not shown."
                        : `${rejectedCount} vaults could not be verified and are not shown.`}
                    </span>
                  </Text>
                )}
                {shownVaults.map((v) => (
                  <VaultCard
                    key={v.id}
                    id={v.id}
                    name={v.name}
                    amount={v.amount}
                    currency={v.currency}
                    status={v.status}
                    deadline={v.deadline}
                    progressPct={v.progressPct}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.25rem",
            }}
          >
            <SectionHeader title="Recent Activity" />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {memoizedActivity.map((a) => {
                const cfg = activityConfig(a.type);
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: "var(--bg)",
                        border: `1px solid var(--border)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: cfg.color,
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {cfg.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text role="caption" as="div" style={{ fontWeight: 600 }}>
                        {cfg.label} ·{" "}
                        <span
                          style={{ color: "var(--muted)", fontWeight: 400 }}
                        >
                          {a.vault}
                        </span>
                      </Text>
                      {a.formattedAmount != null && (
                        <Text
                          role="caption"
                          as="div"
                          style={{ color: "var(--muted)" }}
                        >
                          {a.formattedAmount}
                        </Text>
                      )}
                    </div>
                    <Text
                      role="caption"
                      as="span"
                      style={{ color: "var(--muted)", whiteSpace: "nowrap" }}
                    >
                      {a.relativeTime}
                    </Text>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          <UpcomingDeadlines deadlines={safeDeadlines} />

          {/* Success Rate Chart (sparkline bars) */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.25rem",
            }}
          >
            <SectionHeader title="Success Rate" />
            <Text
              role="caption"
              as="div"
              style={{ color: "var(--muted)", marginBottom: "0.75rem" }}
            >
              Last 6 months
            </Text>
            <SuccessChart />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Success Rate Sparkline ────────────────────────────────────────────────────
// CHART_DATA lives in src/fixtures/dashboard.ts (imported at top of file).

function SuccessChart() {
  return (
    <div
      style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64 }}
    >
      {CHART_DATA.map((d) => (
        <div
          key={d.month}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              width: "100%",
              height: `${d.rate * 0.64}px`,
              background: "var(--accent-transparent)",
              border: "1px solid var(--accent)",
              borderRadius: 3,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: `${d.rate}%`,
                background: "var(--accent)",
                borderRadius: 2,
                opacity: 0.7,
              }}
            />
          </div>
          <Text
            role="caption"
            as="span"
            style={{ color: "var(--muted)", fontSize: 10 }}
          >
            {d.month}
          </Text>
        </div>
      ))}
    </div>
  );
}
