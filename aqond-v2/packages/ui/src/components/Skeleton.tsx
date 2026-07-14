import React from 'react';

type Variant = 'line' | 'card' | 'circle' | 'block';

type Props = React.HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  width?: string | number;
  height?: string | number;
};

export function Skeleton({
  variant = 'line',
  width,
  height,
  className = '',
  style,
  ...props
}: Props) {
  const mergedStyle: React.CSSProperties = {
    width: width ?? (variant === 'circle' ? 40 : undefined),
    height: height ?? (variant === 'circle' ? 40 : undefined),
    ...style,
  };

  return (
    <div
      className={`aq-skeleton aq-skeleton--${variant} ${className}`.trim()}
      style={mergedStyle}
      aria-hidden
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="aq-skeleton-card">
      <Skeleton variant="circle" width={48} height={48} />
      <div className="aq-skeleton-card-lines">
        <Skeleton variant="line" width="70%" />
        <Skeleton variant="line" width="45%" />
      </div>
    </div>
  );
}
