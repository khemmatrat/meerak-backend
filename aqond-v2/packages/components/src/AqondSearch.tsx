'use client';

import React from 'react';
import { Input } from '@aqond/ui';

export type AqondSearchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  onValueChange?: (value: string) => void;
};

export function AqondSearch({
  className = '',
  onValueChange,
  onChange,
  placeholder = 'ค้นหา…',
  ...props
}: AqondSearchProps) {
  return (
    <label className={`aqond-search ${className}`.trim()}>
      <span className="aqond-search-icon" aria-hidden>
        🔍
      </span>
      <Input
        type="search"
        className="aqond-search-input"
        placeholder={placeholder}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
        {...props}
      />
    </label>
  );
}
