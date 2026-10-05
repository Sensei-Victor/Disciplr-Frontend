import type { VaultStatus, Vault } from "../types/vault";
import { formatRelativeTime } from "./relativeTime";

export type { VaultStatus };

export interface VaultPreview {
  id: string;
  name: string;
  amount: number;
  currency: string;
  status: VaultStatus;
  progressPct: number;
  deadline: string;
}

export interface Activity {
  id: string;
  type: "created" | "validated" | "released" | "redirected";
  vault: string;
  timestamp: string;
  amount?: number;
}

export interface Deadline {
  id: string;
  name: string;
  deadline: string;
  amount: number;
}

export interface DashboardSummary {
  totalLocked: number;
  activeVaults: number;
  pendingMilestones: number;
  completionRate: number;
}

export interface FormattedDeadline extends Deadline {
  daysRemaining: number;
  urgencyColor: string;
  formattedDays: string;
  formattedAmount: string;
  formattedDate: string;
}

export interface FormattedActivity extends Activity {
  formattedAmount?: string;
  relativeTime: string;
}

/**
 * Returns the number of days remaining until a deadline.
 *
 * Invariants:
 * - Returns `NaM` for invalid date strings so callers can reject them.
 * - Returns a finite number for valid inputs.
 */
export function daysRemaining(
  deadline: string,
  now: number = Date.now(),
): number {
  if (typeof deadline !== "string" || deadline.trim() === "") {
    return NaN;
  }
  const timestamp = new Date(deadline).getTime();
  if (!Number.isFinite(timestamp)) {
    return NaN;
  }
  if (!Number.isFinite(now)) {
    return NaN;
  }
  return Math.ceil((timestamp - now) / 86400000);
}

export function urgencyColor(days: number): string {
  if (!Number.isFinite(days)) return "var(--danger)";
  if (days < 0) return "var(--danger)";
  if (days <= 7) return "var(--danger)";
  if (days <= 30) return "var(--warning)";
  return "var(--success)";
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  if (typeof iso !== "string" || iso.trim() === "") {
    return "";
  }
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) {
    return "";
  }
  return formatRelativeTime(iso, now);
}

/**
 * Derive a DashboardSummary from a list of full vaults.
 *
 * - totalLocked: sum of amounts for all active/pending_validation vaults.
 * - activeVaults: count of vaults with status 'active' or 'pending_validation'.
 * - pendingMilestones: count of all milestones with status 'pending' across all vaults.
 * - completionRate: completed / (completed + failed + cancelled) * 100, guarded against
 *   divide-by-zero (returns 0 when no terminal vaults exist).
 *
 * Authorization / validation invariants:
 * - Only vaults with a recognized status are counted toward totalLocked/activeVaults.
 * - Negative or non-finite amounts are ignored so corrupt data cannot inflate totals.
 * - Milestones are only counted when the vault is in an active state.
 * - Output is deterministic and independent of input ordering.
 */
export function computeDashboardSummary(vaults: Vault[]): DashboardSummary {
  const ACTIVE_STATUSES: Vault["status"][] = ["active", "pending_validation"];
  const TERMINAL_STATUSE: Vault["status"][] = ["completed", "failed", "cancelled"];

  if (!Array.isArray(vaults)) {
    return { totalLocked: 0, activeVaults: 0, pendingMilestones: 0, completionRate: 0 };
  }

  let totalLocked = 0;
  let activeVaults = 0;
  let pendingMilestones = 0;
  let completedVaults = 0;
  let terminalVaults = 0;

  for (const v of vaults) {
    if (!v || typeof v !== "object") continue;

    const isActive = ACTIVE_STATUSES.includes(v.status);
    if (isActive) {
      // Reject non-finite or negative amounts to avoid corrupting totals.
      if (typeof v.amount === "number" && Number.isFinite(v.amount) && v.amount >= 0) {
        totalLocked += v.amount;
      }
      activeVaults++;
    }
    if (v.status === "completed") completedVaults++;
    if (TERMINAL_STATUSES.includes(v.status)) terminalVaults++;

    // Count pending milestones only for active vaults.
    if (isActive && Array.isArray(v.milestones)) {
      for (const m of v.milestones) {
        if (m && m.status === "pending") pendingMilestones++;
      }
    }
  }

  const completionRate =
    terminalVaults === 0
      ? 0
      : Math.round((completedVaults / terminalVaults) * 100);

  return {
    totalLocked,
    activeVaults,
    pendingMilestones,
    completionRate,
  };
}

export function formatSummary(summary: DashboardSummary) {
  const safe = {
    totalLocked: Number.isFinite(summary?.totalLocked) ? summary.totalLocked : 0,
    activeVaults: Number.isFinite(summary?.activeVaults) ? summary.activeVaults : 0,
    pendingMilestones: Number.isFinite(summary?.pendingMilestones) ? summary.pendingMilestones : 0,
    completionRate: Number.isFinite(summary?.completionRate) ? summary.completionRate : 0,
  };
  return {
    totalLocked: `$${safe.totalLocked.toLocaleString()}`,
    activeVaults: String(safe.activeVaults),
    pendingMilestones: String(safe.pendingMilestones),
    completionRate: `${safe.completionRate}%`,
  };
}

export function processDeadlines(
  deadlines: Deadline[],
  now: number = Date.now(),
): FormattedDeadline[] {
  if (!Array.isArray(deadlines)) return [];
  return [...deadlines]
    .filter((d): d is Deadline => {
      if (!d || typeof d !== "object") return false;
      if (typeof d.deadline !== "string" || d.deadline.trim() === "") return false;
      return Number.isFinite(new Date(d.deadline).getTime());
    })
    .sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    )
    .map((d) => {
      const days = daysRemaining(d.deadline, now);
      const color = urgencyColor(days);
      const amount = Number.isFinite(d.amount) ? d.amount : 0;
      return {
        ...d,
        amount,
        daysRemaining: days,
        urgencyColor: color,
        formattedDays: days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`,
        formattedAmount: `${amount.toLocaleString()} USDC`,
        formattedDate: new Date(d.deadline).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      };
    });
}

export function processActivity(
  activities: Activity[],
  now: number = Date.now(),
): FormattedActivity[] {
  if (!Array.isArray(activities)) return [];
  return [...activities]
    .filter((a): a is Activity => {
      if (!a || typeof a !== "object") return false;
      if (typeof a.timestamp !== "string" || a.timestamp.trim() === "") return false;
      return Number.isFinite(new Date(a.timestamp).getTime());
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .map((a) => {
      const amount =
        a.amount != null && Number.isFinite(a.amount) ? a.amount : undefined;
      return {
        ...a,
        amount,
        formattedAmount:
          amount != null ? `${amount.toLocaleString()} USDC` : undefined,
        relativeTime: relativeTime(a.timestamp, now),
      };
    });
}
