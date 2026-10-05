import React from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

/**
 * Render a placeholder state with an optional icon, title, description, and call-to-action button.
 * The call-to-action button explicitly enforces type="button" by default to prevent unintended form submissions.
 *
 * @param props - Configuration properties for the empty state display.
 * @returns React component representing the empty state view.
 */
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  const containerClass = `empty-state ${className}`.trim();
  const actionType = action?.type ?? 'button';

  return (
    <div className={containerClass} role="status">
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && (
        <button
          type={actionType}
          className={`empty-state-action ${action.className ?? ''}`.trim()}
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.ariaLabel}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
