import React from "react";
import { Tooltip } from "./Tooltip";
import { logger } from "../utils/logger";

export type ChipStatus =
  | "active"
  | "pending_validation"
  | "completed"
  | "failed"
  | "cancelled"
  | "approved"
  | "rejected";

export interface StatusChipProps {
  status: ChipStatus;
  label?: string;
  /** Optional extra description shown in a tooltip (e.g. full status explanation). */
  tooltip?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const STATUS_CONFIG: Record<
  ChipStatus,
  { defaultLabel: string; color: string; bg: string; description: string }
> = {
  active: {
    defaultLabel: "Active",
    color: "var(--accent)",
    bg: "var(--accent-transparent)",
    description: "This vault is currently active.",
  },
  completed: {
    defaultLabel: "Completed",
    color: "var(--success)",
    bg: "color-mix(in srgb, var(--success) 10%, transparent)",
    description: "All milestones have been completed.",
  },
  failed: {
    defaultLabel: "Failed",
    color: "var(--danger)",
    bg: "color-mix(in srgb, var(--danger) 10%, transparent)",
    description: "This operation failed.",
  },
  cancelled: {
    defaultLabel: "Cancelled",
    color: "var(--muted)",
    bg: "color-mix(in srgb, var(--muted) 10%, transparent)",
    description: "This vault has been cancelled.",
  },
  pending_validation: {
    defaultLabel: "Pending Validation",
    color: "var(--warning)",
    bg: "color-mix(in srgb, var(--warning) 10%, transparent)",
    description: "Awaiting verifier validation.",
  },
  approved: {
    defaultLabel: "Approved",
    color: "var(--success)",
    bg: "color-mix(in srgb, var(--success) 10%, transparent)",
    description: "This milestone has been approved.",
  },
  rejected: {
    defaultLabel: "Rejected",
    color: "var(--danger)",
    bg: "color-mix(in srgb, var(--danger) 10%, transparent)",
    description: "This milestone was rejected.",
  },
};

const SIZE_STYLES = {
  sm: { padding: "2px 8px", fontSize: "11px" },
  md: { padding: "2px 10px", fontSize: "12px" },
  lg: { padding: "4px 12px", fontSize: "14px" },
};

/**
 * Renders an accessible status chip badge with semantic styling.
 *
 * @param props Component properties including status, optional label override,
 * tooltip, size, and className.
 * @returns An accessible badge element wrapped in a Tooltip.
 */
export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  tooltip,
  size = "md",
  className = "",
}) => {
  const isKnown = Boolean(
    status && Object.prototype.hasOwnProperty.call(STATUS_CONFIG, status)
  );

  if (!isKnown) {
    logger.warn(`Unrecognized status encountered in StatusChip: "${String(status)}"`);
  }

  const config = isKnown
    ? STATUS_CONFIG[status]
    : {
        defaultLabel: status ? String(status) : "Unknown",
        color: "var(--muted)",
        bg: "color-mix(in srgb, var(--muted) 10%, transparent)",
        description: status ? `Unknown status: ${String(status)}` : "Unknown status",
      };

  const sizeStyle = SIZE_STYLES[size];
  const displayLabel = label ?? config.defaultLabel;
  const tooltipContent = tooltip ?? config.description;
  const shouldBeFocusable = tooltip !== undefined;

  const chip = (
    <span
      className={`status-chip ${className}`.trim()}
      style={{
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.color}`,
        borderRadius: "var(--radius-full)",
        fontWeight: 600,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        ...sizeStyle,
      }}
      aria-label={displayLabel}
      {...(shouldBeFocusable && { tabIndex: 0 })}
    >
      {displayLabel}
    </span>
  );

  return (
    <Tooltip content={tooltipContent} position="top">
      {chip}
    </Tooltip>
  );
};
