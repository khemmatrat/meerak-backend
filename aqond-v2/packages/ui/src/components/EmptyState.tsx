import React from 'react';
import { Button } from './Button';

type Props = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: Props) {
  return (
    <div className={`aq-empty ${className}`.trim()} role="status">
      {icon && <div className="aq-empty-icon" aria-hidden>{icon}</div>}
      <h3 className="aq-empty-title">{title}</h3>
      {description && <p className="aq-empty-desc">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction} style={{ marginTop: 16 }}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
