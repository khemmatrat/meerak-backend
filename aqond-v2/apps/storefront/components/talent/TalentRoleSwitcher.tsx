'use client';

import { useState } from 'react';
import { useTalentRole } from '@/lib/talent/TalentRoleContext';
import { TALENT_ROLE_META, type TalentRoleId } from '@/lib/talent/talentRoleTypes';

export function TalentRoleSwitcher() {
  const { activeRole, availableRoles, setActiveRole } = useTalentRole();
  const [open, setOpen] = useState(false);

  if (availableRoles.length <= 1) return null;

  return (
    <div className="tt-talent-role-switch">
      <button
        type="button"
        className="tt-talent-role-switch-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tt-talent-role-switch-label">Workspace</span>
        <span className="tt-talent-role-switch-value">
          {TALENT_ROLE_META[activeRole].icon} {TALENT_ROLE_META[activeRole].shortLabel}
        </span>
      </button>
      {open && (
        <ul className="tt-talent-role-switch-menu" role="listbox" aria-label="สลับ workspace role">
          {availableRoles.map((role: TalentRoleId) => {
            const meta = TALENT_ROLE_META[role];
            const selected = role === activeRole;
            return (
              <li key={role}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={selected ? 'active' : ''}
                  onClick={() => {
                    setActiveRole(role);
                    setOpen(false);
                  }}
                >
                  <span className="tt-talent-role-switch-option-icon" aria-hidden>
                    {meta.icon}
                  </span>
                  <span className="tt-talent-role-switch-option-text">
                    <strong>{meta.label}</strong>
                    <small>{meta.description}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
