'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { TalentBetaBanner } from '@/components/talent/TalentBetaBanner';
import { TalentGovernanceNotice } from '@/components/talent/TalentGovernanceNotice';
import { TalentNav } from '@/components/talent/TalentNav';
import { TalentRoleBadge } from '@/components/talent/TalentRoleBadge';
import { TalentRoleSwitcher } from '@/components/talent/TalentRoleSwitcher';
import { TALENT_GOVERNANCE_COPY } from '@/lib/talent/talentReleaseGovernance';

export function TalentShell({ children }: { children: ReactNode }) {
  return (
    <div className="tt-talent-shell">
      <aside className="tt-talent-sidebar" aria-label="Talent OS workspace">
        <div className="tt-talent-sidebar-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <div>
            <strong>Talent OS</strong>
            <small>Unified Experience</small>
          </div>
        </div>
        <div className="tt-talent-sidebar-role">
          <TalentRoleBadge />
          <TalentRoleSwitcher />
          <TalentGovernanceNotice message={TALENT_GOVERNANCE_COPY.roleDisclaimer} tone="warn" compact />
        </div>
        <TalentNav variant="sidebar" />
        <Link href="/m/services" className="tt-talent-sidebar-back">
          ← AQOND Services
        </Link>
      </aside>

      <div className="tt-talent-main">
        <header className="tt-talent-header">
          <Link href="/m/account" className="tt-talent-back" aria-label="กลับ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="tt-talent-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tt-talent-title-icon" aria-hidden>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <h1>Talent OS</h1>
          </div>
          <div className="tt-talent-header-context">
            <TalentRoleBadge compact />
          </div>
          <div className="tt-talent-header-actions">
            <Link href="/m/talent/search" className="tt-talent-gear" aria-label="ค้นหา">
              🔍
            </Link>
            <Link href="/m/account" className="tt-talent-gear" aria-label="บัญชี">
              👤
            </Link>
          </div>
        </header>

        <div className="tt-talent-mobile-role-bar">
          <TalentRoleSwitcher />
        </div>

        <TalentBetaBanner />
        <div className="tt-talent-body">{children}</div>

        <TalentNav variant="bottom" />
      </div>
    </div>
  );
}
