import React from 'react';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info';

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

export function Badge({ tone = 'default', className = '', ...props }: Props) {
  const toneClass = tone === 'default' ? '' : ` aq-badge-${tone}`;
  return <span className={`aq-badge${toneClass} ${className}`.trim()} {...props} />;
}
