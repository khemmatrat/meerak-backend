'use client';

import React from 'react';
import { Skeleton, SkeletonCard } from '@aqond/ui';

export type AqondLoadingProps = {
  label?: string;
  variant?: 'inline' | 'page';
  className?: string;
};

export function AqondLoading({
  label = 'กำลังโหลด…',
  variant = 'page',
  className = '',
}: AqondLoadingProps) {
  if (variant === 'inline') {
    return (
      <div className={`aqond-loading aqond-loading--inline ${className}`.trim()} aria-busy aria-label={label}>
        <span className="aqond-loading-spinner" aria-hidden />
        <span className="aqond-loading-label">{label}</span>
      </div>
    );
  }

  return (
    <div className={`aqond-loading aqond-loading--page ${className}`.trim()} aria-busy aria-label={label}>
      <div className="aqond-loading-grid">
        <Skeleton variant="block" className="aqond-loading-stat" />
        <Skeleton variant="block" className="aqond-loading-stat" />
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <p className="aqond-loading-label">{label}</p>
    </div>
  );
}
