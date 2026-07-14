import React from 'react';

export type BottomNavItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

type Props = {
  items: BottomNavItem[];
  className?: string;
  /** aria-label for nav landmark */
  label?: string;
};

export function BottomNav({ items, className = '', label = 'นำทางหลัก' }: Props) {
  return (
    <nav className={`aq-bottom-nav ${className}`.trim()} aria-label={label}>
      {items.map((item) => {
        const cls = `aq-bottom-nav-item${item.active ? ' aq-bottom-nav-item--active' : ''}`;
        const content = (
          <>
            {item.icon && <span className="aq-bottom-nav-icon">{item.icon}</span>}
            <span className="aq-bottom-nav-label">{item.label}</span>
          </>
        );
        if (item.href) {
          return (
            <a
              key={item.id}
              href={item.href}
              className={cls}
              aria-current={item.active ? 'page' : undefined}
              onClick={item.onClick}
            >
              {content}
            </a>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={cls}
            aria-current={item.active ? 'page' : undefined}
            onClick={item.onClick}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
