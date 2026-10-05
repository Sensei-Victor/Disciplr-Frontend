import React from 'react';


export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Visual size variant for the badge. */
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  /** Semantic color tone. Defaults to 'neutral'. */
  tone?: BadgeTone;
  /** Size variant controlling padding and font size. Defaults to 'md'. */
  size?: BadgeSize;
  /**
   * Human-readable description of the badge content surfaced to assistive
   * technology. Required for numeric badges (e.g. "12 unread notifications").
   * When omitted the badge text is used as the accessible name.
   */
  'aria-label'?: string;
  /** Additional CSS class names to forward to the root element. */
  className?: string;
  /** Badge content — a number, short label, or icon. */
  children: React.ReactNode;
}

/** Token-driven color configuration for each tone. */
const TONE_CONFIG: Record<BadgeTone, { color: string; bg: string; border: string }> = {
  neutral: {
    color: 'var(--muted)',
    bg: 'color-mix(in srgb, var(--muted) 10%, transparent)',
    border: 'var(--muted)',
  },
  info: {
    color: 'var(--info)',
    bg: 'color-mix(in srgb, var(--info) 10%, transparent)',
    border: 'var(--info)',
  },
  success: {
    color: 'var(--success)',
    bg: 'color-mix(in srgb, var(--success) 10%, transparent)',
    border: 'var(--success)',
  },
  warning: {
    color: 'var(--warning)',
    bg: 'var(--warning-transparent)',
    border: 'var(--warning)',
  },
  danger: {
    color: 'var(--danger)',
    bg: 'var(--danger-transparent)',
    border: 'var(--danger)',
  },
};

/** Padding and font-size per size variant. */
const SIZE_STYLES: Record<BadgeSize, React.CSSProperties> = {
  sm: { padding: '1px 6px', fontSize: '10px', minWidth: '18px' },
  md: { padding: '2px 8px', fontSize: '11px', minWidth: '20px' },
  lg: { padding: '3px 10px', fontSize: '13px', minWidth: '24px' },
};

/**
 * `Badge` is a generic pill/chip primitive for numeric counts and short tier
 * labels (e.g. urgency tiers, unread counts, queue counts).
 *
 * - Token-styled via CSS custom properties — no hardcoded colors.
 * - Numeric badges should pass an `aria-label` such as
 *   "12 unread notifications" so the count is meaningful out of context.
 * - For status labels prefer `StatusChip`, which owns the vault/validation
 *   status vocabulary. `Badge` is for counts and ad-hoc tier labels.
 *
 * @example
 * // Urgency tier
 * <Badge tone="danger" size="sm" aria-label="Critical: expires within 24 hours">
 *   Expires soon!
 * </Badge>
 *
 * @example
 * // Unread count
 * <Badge tone="info" aria-label="5 unread notifications">5</Badge>
 */
export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  size = 'md',
  'aria-label': ariaLabel,
  className = '',
  children,
}) => {
  const { color, bg, border } = TONE_CONFIG[tone];
  const sizeStyle = SIZE_STYLES[size];

  return (
    <span
      className={`badge${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${border}`,
        background: bg,
        color,
        ...sizeStyle,
      }}
    >
      {children}
    </span>
  );
};

export default Badge;
