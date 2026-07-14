'use client';

import React from 'react';

export type AqondHeaderProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  className?: string;
};

export function AqondHeader({
  title,
  subtitle,
  backHref,
  backLabel = '‹ กลับ',
  onBack,
  actions,
  className = '',
}: AqondHeaderProps) {
  const back =
    backHref ? (
      <a href={backHref} className="aqond-header-back">
        {backLabel}
      </a>
    ) : onBack ? (
      <button type="button" className="aqond-header-back" onClick={onBack}>
        {backLabel}
      </button>
    ) : null;

  return (
    <header className={`aqond-header ${className}`.trim()}>
      <div className="aqond-header-main">
        {back}
        <div>
          <h1 className="aqond-header-title">{title}</h1>
          {subtitle && <p className="aqond-header-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="aqond-header-actions">{actions}</div>}
    </header>
  );
}
