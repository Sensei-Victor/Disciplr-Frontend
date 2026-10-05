export interface Notification {
  id: string;
  type: string;
  isUrgent: boolean;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  category: string;
}

export interface Vault {
  name: string;
}

/**
 * Authorization and validation invariants for the notification example module.
 *
 * The example module is used by demo/storybook pages and tests. It must return
 * deterministic, immutable data so that consumers cannot accidentally mutate
 * shared state between renders or tests. The following invariants are enforced:
 *
 *  1. Every notification has a non-empty, unique id matching /^ntf_\d+$/.
 *  2. Every notification type is a non-empty string.
 *  3. Timestamps are valid ISO 8601 strings.
 *  4. isUrgent and isRead are booleans.
 *  5. Returned arrays are deeply frozen so callers cannot mutate shared state.
 *  6. Calls are deterministic and idempotent: repeated calls return equivalent
 *     data with the same ordering.
 */

const NOTIFICATION_ID_PATTERN = /^ntf_\d+$/;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value as Readonly<T>;
}

function assertNotificationInvariants(
  notifications: ReadonlyArray<Notification>,
): void {
  const seenIds = new Set<string>();

  for (const n of notifications) {
    if (!n || typeof n !== "object") {
      throw new Error("Notification entry must be an object.");
    }

    if (typeof n.id !== "string" || !NOTIFICATION_ID_PATTERN.test(n.id)) {
      throw new Error(
        `Notification id must match ${NOTIFICATION_ID_PATTERN.source}, received: ${String(n.id)}`,
      );
    }

    if (seenIds.has(n.id)) {
      throw new Error(`Duplicate notification id: ${n.id}`);
    }
    seenIds.add(n.id);

    if (typeof n.type !== "string" || n.type.length === 0) {
      throw new Error(`Notification ${n.id} has an invalid type.`);
    }

    if (typeof n.title !== "string" || n.title.length === 0) {
      throw new Error(`Notification ${n.id} has an invalid title.`);
    }

    if (typeof n.message !== "string" || n.message.length === 0) {
      throw new Error(`Notification ${n.id} has an invalid message.`);
    }

    if (typeof n.category !== "string" || n.category.length === 0) {
      throw new Error(`Notification ${n.id} has an invalid category.`);
    }

    if (typeof n.isUrgent !== "boolean") {
      throw new Error(`Notification ${n.id} has an invalid isUrgent flag.`);
    }

    if (typeof n.isRead !== "boolean") {
      throw new Error(`Notification ${n.id} has an invalid isRead flag.`);
    }

    if (typeof n.timestamp !== "string" || Number.isNaN(Date.parse(n.timestamp))) {
      throw new Error(`Notification ${n.id} has an invalid timestamp.`);
    }
  }
}

const NOTIFICATIONS: ReadonlyArray<Notification> = deepFreeze(
  [
    {
      id: "ntf_001",
      type: "vault_deadline_approaching",
      isUrgent: true,
      title: "Urgent: Deadline Approaching",
      message:
        "The 'Q2 Operations' vault expires in 12 hours. Ensure all milestones are validated.",
      timestamp: "2026-04-24T08:00:00Z",
      isRead: false,
      category: "vault",
    },
    {
      id: "ntf_002",
      type: "funds_released",
      isUrgent: false,
      title: "Funds Released",
      message:
        "$4,200.00 has been transferred to your wallet from 'Marketing Phase 1'.",
      timestamp: "2026-04-24T07:45:00Z",
      isRead: true,
      category: "funds",
    },
    {
      id: "ntf_003",
      type: "verification_requested",
      isUrgent: false,
      title: "Verification Requested",
      message:
        "User @alex_dev requested verification for 'Database Migration'.",
      timestamp: "2026-04-24T07:10:00Z",
      isRead: false,
      category: "verification",
    },
    {
      id: "ntf_004",
      type: "vault_created_successfully",
      isUrgent: false,
      title: "Vault Created",
      message: "Vault 'House Reno 2026' was successfully deployed on-chain.",
      timestamp: "2026-04-24T06:30:00Z",
      isRead: false,
      category: "vault",
    },
    {
      id: "ntf_005",
      type: "milestone_validated",
      isUrgent: false,
      title: "Milestone Validated",
      message: "Great news! 'Frontend UI It' milestone has been approved.",
      timestamp: "2026-04-24T04:00:00Z",
      isRead: false,
      category: "milestone",
    },
    {
      id: "ntf_006",
      type: "funds_redirected",
      isUrgent: true,
      title: "Funds Redirected",
      message: "Funds from 'Legacy Project' were redirected back to the owner.",
      timestamp: "2026-04-24T01:00:00Z",
      isRead: false,
      category: "funds",
    },
    {
      id: "ntf_007",
      type: "system_announcement",
      isUrgent: false,
      title: "New Feature Available",
      message: "You can now batch-validate milestones from your dashboard.",
      timestamp: "2026-04-23T20:00:00Z",
      isRead: true,
      category: "system",
    },
    {
      id: "ntf_008",
      type: "vault_deadline_approaching",
      isUrgent: true,
      title: "Urgent: Deadline Approaching",
      message: "Deadline for 'Annual Audit' vault is in 3 days.",
      timestamp: "2026-04-23T18:30:00Z",
      isRead: true,
      category: "vault",
    },
    {
      id: "ntf_009",
      type: "verification_requested",
      isUrgent: false,
      title: "Verification Requested",
      message:
        "Verify completion of 'Smart Contract Integration' by @crypto_node.",
      timestamp: "2026-04-23T15:00:00Z",
      isRead: true,
      category: "verification",
    },
    {
      id: "ntf_010",
      type: "milestone_validated",
      isUrgent: false,
      title: "Milestone Validated",
      message: "'Content Strategy' milestone has been verified and closed.",
      timestamp: "2026-04-23T12:00:00Z",
      isRead: true,
      category: "milestone",
    },
    {
      id: "ntf_011",
      type: "funds_released",
      isUrgent: false,
      title: "Funds Released",
      message: "$500.00 released for 'Bug Bounty Program'.",
      timestamp: "2026-04-23T09:00:00Z",
      isRead: true,
      category: "funds",
    },
    {
      id: "ntf_012",
      type: "system_announcement",
      isUrgent: false,
      title: "Maintenance Notice",
      message: "Platform will be offline for 30 mins tonight at 00:00 UTC.",
      timestamp: "2026-04-22T22:00:00Z",
      isRead: true,
      category: "system",
    },
    {
      id: "ntf_013",
      type: "vault_created_successfully",
      isUrgent: false,
      title: "Vault Created",
      message: "Successfully created vault 'Legal Fees Fund'.",
      timestamp: "2026-04-22T16:45:00Z",
      isRead: true,
      category: "vault",
    },
    {
      id: "ntf_014",
      type: "funds_redirected",
      isUrgent: true,
      title: "Funds Redirected",
      message: "Funds redirected from 'Inactive Seed Vault' due to timeout.",
      timestamp: "2026-04-22T11:20:00Z",
      isRead: true,
      category: "funds",
    },
    {
      id: "ntf_015",
      type: "milestone_validated",
      isUrgent: false,
      title: "Milestone Validated",
      message: "The 'SEO Research' milestone is officially validated.",
      timestamp: "2026-04-21T14:00:00Z",
      isRead: true,
      category: "milestone",
    },
    {
      id: "ntf_016",
      type: "vault_deadline_approaching",
      isUrgent: true,
      title: "Urgent: Deadline Approaching",
      message: "The 'AWS Hosting' vault deadline is tomorrow.",
      timestamp: "2026-04-21T09:30:00Z",
      isRead: true,
      category: "vault",
    },
    {
      id: "ntf_017",
      type: "verification_requested",
      isUrgent: false,
      title: "Verification Requested",
      message: "@design_lead requested verification for 'Logo Finalization'.",
      timestamp: "2026-04-20T17:15:00Z",
      isRead: true,
      category: "verification",
    },
    {
      id: "ntf_018",
      type: "vault_created_successfully",
      isUrgent: false,
      title: "Vault Created",
      message: "Successfully created vault 'Q3 Reserve'.",
      timestamp: "2026-04-20T10:00:00Z",
      isRead: true,
      category: "vault",
    },
    {
      id: "ntf_019",
      type: "system_announcement",
      isUrgent: false,
      title: "Policy Update",
      message:
        "We have updated our terms of service regarding vault redirection.",
      timestamp: "2026-04-19T08:00:00Z",
      isRead: true,
      category: "system",
    },
    {
      id: "ntf_020",
      type: "funds_released",
      isUrgent: false,
      title: "Funds Released",
      message: "$10,000.00 released from 'Milestone 5: Production'.",
      timestamp: "2026-04-18T16:00:00Z",
      isRead: true,
      category: "funds",
    },
  ],
);

assertNotificationInvariants(NOTIFICATIONS);

/**
 * Returns the canonical list of example notifications.
 *
 * The returned array is deeply frozen and the same reference is returned on
 * every call, so callers cannot mutate shared state and repeated calls are
 * deterministic.
 */
export function getNotifications(): ReadonlyArray<Notification> {
  return NOTIFICATIONS;
}

export const vaults: ReadonlyArray<Vault> = deepFreeze([
  { name: "First Vault" },
  { name: "Second Vault" },
  { name: "Third Vault" },
]);
