import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({ variant = 'primary', className = '', ...props }: Props) {
  return (
    <button
      className={`aq-btn aq-btn-${variant} ${className}`.trim()}
      {...props}
    />
  );
}
